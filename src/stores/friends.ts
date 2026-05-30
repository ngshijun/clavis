import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'
import { toMYTDateString } from '@/lib/date'

export const FRIEND_CAP = 30

type FriendshipProfile = {
  id: string
  updated_at: string | null
  profiles: { name: string; avatar_path: string | null }
}

export const CLOSENESS_THRESHOLDS = [0, 5, 15, 35, 70, 120] as const

export const CLOSENESS_LABELS: Record<number, string> = {
  0: 'New Friend',
  1: 'Acquaintance',
  2: 'Buddy',
  3: 'Good Friend',
  4: 'Close Friend',
  5: 'Best Friend',
}

function getClosenessLabel(level: number): string {
  return CLOSENESS_LABELS[level] ?? CLOSENESS_LABELS[0]!
}

export interface Friend {
  friendshipId: string
  friendId: string
  name: string
  avatarPath: string | null
  closenessXp: number
  closenessLevel: number
  closenessLabel: string
  friendSince: string
  lastActive: string | null
  sentToday: boolean
  receivedToday: boolean
}

export interface FriendRequest {
  friendshipId: string
  studentId: string
  name: string
  avatarPath: string | null
  createdAt: string
}

function parseFriendshipProfile(value: unknown): FriendshipProfile {
  // Supabase may return an embedded to-one relation as an object or a
  // single-element array depending on the inferred shape; normalize both.
  const candidate = Array.isArray(value) ? value[0] : value
  if (candidate && typeof candidate === 'object' && 'id' in candidate && 'profiles' in candidate) {
    const { id, updated_at, profiles } = candidate as {
      id: unknown
      updated_at?: unknown
      profiles: unknown
    }
    const profile = Array.isArray(profiles) ? profiles[0] : profiles
    if (
      typeof id === 'string' &&
      profile &&
      typeof profile === 'object' &&
      'name' in profile &&
      typeof (profile as { name: unknown }).name === 'string'
    ) {
      const { name, avatar_path } = profile as { name: string; avatar_path: unknown }
      return {
        id,
        updated_at: typeof updated_at === 'string' ? updated_at : null,
        profiles: {
          name,
          avatar_path: typeof avatar_path === 'string' ? avatar_path : null,
        },
      }
    }
  }
  throw new Error('Unexpected friendship profile shape')
}

function getOtherProfile(
  row: { requester_id: string; recipient_id: string; requester: unknown; recipient: unknown },
  userId: string,
): FriendshipProfile {
  const isRequester = row.requester_id === userId
  return parseFriendshipProfile(isRequester ? row.recipient : row.requester)
}

export const useFriendsStore = defineStore('friends', () => {
  const authStore = useAuthStore()

  const friends = ref<Friend[]>([])
  const receivedRequests = ref<FriendRequest[]>([])
  const sentRequests = ref<FriendRequest[]>([])
  const isLoading = ref(false)
  const hasFetchedFriends = ref(false)
  const hasFetchedRequests = ref(false)

  const friendCount = computed(() => friends.value.length)
  const pendingRequestCount = computed(() => receivedRequests.value.length)
  const isFriendCapReached = computed(() => friendCount.value >= FRIEND_CAP)

  async function fetchFriends(): Promise<{ error: string | null }> {
    const userId = authStore.user?.id
    if (!userId) return { error: errorMessages().notAuthenticated }

    try {
      isLoading.value = true

      const [friendshipsResult, giftsResult] = await Promise.all([
        supabase
          .from('friendships')
          .select(
            `
            id,
            requester_id,
            recipient_id,
            closeness_xp,
            closeness_level,
            created_at,
            responded_at,
            requester:student_profiles!friendships_requester_id_fkey(
              id,
              updated_at,
              profiles!inner(name, avatar_path)
            ),
            recipient:student_profiles!friendships_recipient_id_fkey(
              id,
              updated_at,
              profiles!inner(name, avatar_path)
            )
          `,
          )
          .eq('status', 'accepted')
          .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`),
        supabase
          .from('daily_coin_gifts')
          .select('friendship_id, sender_id')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .eq('sent_date', toMYTDateString()),
      ])

      if (friendshipsResult.error) throw friendshipsResult.error
      if (giftsResult.error) throw giftsResult.error

      const sentGiftSet = new Set<string>()
      const receivedGiftSet = new Set<string>()
      for (const g of giftsResult.data ?? []) {
        if (g.sender_id === userId) {
          sentGiftSet.add(g.friendship_id)
        } else {
          receivedGiftSet.add(g.friendship_id)
        }
      }

      friends.value = (friendshipsResult.data ?? []).map((row) => {
        const other = getOtherProfile(row, userId)
        return {
          friendshipId: row.id,
          friendId: other.id,
          name: other.profiles.name,
          avatarPath: other.profiles.avatar_path,
          closenessXp: row.closeness_xp,
          closenessLevel: row.closeness_level,
          closenessLabel: getClosenessLabel(row.closeness_level),
          friendSince: row.responded_at ?? row.created_at,
          lastActive: other.updated_at,
          sentToday: sentGiftSet.has(row.id),
          receivedToday: receivedGiftSet.has(row.id),
        }
      })
      hasFetchedFriends.value = true

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedLoadFriends') }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchRequests(): Promise<{ error: string | null }> {
    const userId = authStore.user?.id
    if (!userId) return { error: errorMessages().notAuthenticated }

    try {
      const { data, error: fetchError } = await supabase
        .from('friendships')
        .select(
          `
          id,
          requester_id,
          recipient_id,
          created_at,
          requester:student_profiles!friendships_requester_id_fkey(
            id,
            profiles!inner(name, avatar_path)
          ),
          recipient:student_profiles!friendships_recipient_id_fkey(
            id,
            profiles!inner(name, avatar_path)
          )
        `,
        )
        .eq('status', 'pending')
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('created_at', { ascending: false })

      if (fetchError) throw fetchError

      receivedRequests.value = []
      sentRequests.value = []

      for (const row of data ?? []) {
        const other = getOtherProfile(row, userId)
        const request: FriendRequest = {
          friendshipId: row.id,
          studentId: other.id,
          name: other.profiles.name,
          avatarPath: other.profiles.avatar_path,
          createdAt: row.created_at,
        }

        if (row.requester_id === userId) {
          sentRequests.value.push(request)
        } else {
          receivedRequests.value.push(request)
        }
      }
      hasFetchedRequests.value = true

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedLoadFriendRequests') }
    }
  }

  async function sendRequest(targetId: string): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('send_friend_request', {
        p_target_id: targetId,
      })
      if (rpcError) throw rpcError
      await fetchRequests()
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedSendFriendRequest') }
    }
  }

  async function respondRequest(
    friendshipId: string,
    accept: boolean,
  ): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('respond_friend_request', {
        p_friendship_id: friendshipId,
        p_accept: accept,
      })
      if (rpcError) throw rpcError
      await Promise.all([fetchRequests(), fetchFriends()])
      return { error: null }
    } catch (err) {
      return {
        error: handleError(
          err,
          accept ? 'failedAcceptFriendRequest' : 'failedDeclineFriendRequest',
        ),
      }
    }
  }

  async function sendCoins(friendshipId: string): Promise<{ error: string | null }> {
    try {
      const { data, error: rpcError } = await supabase.rpc('send_daily_coins', {
        p_friendship_id: friendshipId,
      })
      if (rpcError) throw rpcError

      const friend = friends.value.find((f) => f.friendshipId === friendshipId)
      if (friend) {
        friend.sentToday = true

        // RPC returns post-update closeness state either way; mirror it so
        // the UI reflects mutual-send level-ups without a refetch.
        const result = data as { closeness_xp: number; closeness_level: number } | null
        if (result) {
          friend.closenessXp = result.closeness_xp
          friend.closenessLevel = result.closeness_level
          friend.closenessLabel = getClosenessLabel(result.closeness_level)
        }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedSendCoins') }
    }
  }

  async function removeFriend(friendshipId: string): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('remove_friend', {
        p_friendship_id: friendshipId,
      })
      if (rpcError) throw rpcError
      friends.value = friends.value.filter((f) => f.friendshipId !== friendshipId)
      sentRequests.value = sentRequests.value.filter((r) => r.friendshipId !== friendshipId)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedRemoveFriend') }
    }
  }

  function $reset() {
    friends.value = []
    receivedRequests.value = []
    sentRequests.value = []
    isLoading.value = false
    hasFetchedFriends.value = false
    hasFetchedRequests.value = false
  }

  return {
    friends,
    receivedRequests,
    sentRequests,
    isLoading,
    friendCount,
    pendingRequestCount,
    isFriendCapReached,
    hasFetchedFriends,
    hasFetchedRequests,
    fetchFriends,
    fetchRequests,
    sendRequest,
    respondRequest,
    sendCoins,
    removeFriend,
    $reset,
  }
})
