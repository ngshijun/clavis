import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError } from '@/lib/errors'

const FRIEND_CAP = 30

const CLOSENESS_LABELS: Record<number, string> = {
  0: 'New Friend',
  1: 'Acquaintance',
  2: 'Buddy',
  3: 'Good Friend',
  4: 'Close Friend',
  5: 'Best Friend',
}

export interface Friend {
  friendshipId: string
  friendId: string
  name: string
  avatarPath: string | null
  closenessXp: number
  closenessLevel: number
  closenessLabel: string
  sentToday: boolean
}

export interface FriendRequest {
  friendshipId: string
  studentId: string
  name: string
  avatarPath: string | null
  createdAt: string
}

export const useFriendsStore = defineStore('friends', () => {
  const authStore = useAuthStore()

  const friends = ref<Friend[]>([])
  const receivedRequests = ref<FriendRequest[]>([])
  const sentRequests = ref<FriendRequest[]>([])
  const isLoading = ref(false)

  const friendCount = computed(() => friends.value.length)
  const pendingRequestCount = computed(() => receivedRequests.value.length)
  const isFriendCapReached = computed(() => friendCount.value >= FRIEND_CAP)

  async function fetchFriends(): Promise<{ error: string | null }> {
    const userId = authStore.user?.id
    if (!userId) return { error: 'Not authenticated' }

    try {
      isLoading.value = true

      const { data, error: fetchError } = await supabase
        .from('friendships')
        .select(
          `
          id,
          requester_id,
          recipient_id,
          closeness_xp,
          closeness_level,
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
        .eq('status', 'accepted')
        .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)

      if (fetchError) throw fetchError

      const { data: todayGifts, error: giftsError } = await supabase
        .from('daily_coin_gifts')
        .select('friendship_id')
        .eq('sender_id', userId)
        .eq('sent_date', new Date().toISOString().split('T')[0])

      if (giftsError) throw giftsError

      const sentGiftSet = new Set(todayGifts?.map((g) => g.friendship_id) ?? [])

      friends.value = (data ?? []).map((row) => {
        const isRequester = row.requester_id === userId
        const friendProfile = isRequester ? row.recipient : row.requester
        const profile = (friendProfile as any).profiles

        return {
          friendshipId: row.id,
          friendId: (friendProfile as any).id,
          name: profile.name,
          avatarPath: profile.avatar_path,
          closenessXp: row.closeness_xp,
          closenessLevel: row.closeness_level,
          closenessLabel: CLOSENESS_LABELS[row.closeness_level] ?? 'New Friend',
          sentToday: sentGiftSet.has(row.id),
        }
      })

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'Failed to load friends.') }
    } finally {
      isLoading.value = false
    }
  }

  async function fetchRequests(): Promise<{ error: string | null }> {
    const userId = authStore.user?.id
    if (!userId) return { error: 'Not authenticated' }

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
        const isRequester = row.requester_id === userId
        const otherProfile = isRequester ? row.recipient : row.requester
        const profile = (otherProfile as any).profiles

        const request: FriendRequest = {
          friendshipId: row.id,
          studentId: (otherProfile as any).id,
          name: profile.name,
          avatarPath: profile.avatar_path,
          createdAt: row.created_at,
        }

        if (isRequester) {
          sentRequests.value.push(request)
        } else {
          receivedRequests.value.push(request)
        }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'Failed to load friend requests.') }
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
      return { error: handleError(err, 'Failed to send friend request.') }
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
      return { error: handleError(err, `Failed to ${accept ? 'accept' : 'decline'} request.`) }
    }
  }

  async function sendCoins(friendshipId: string): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('send_daily_coins', {
        p_friendship_id: friendshipId,
      })
      if (rpcError) throw rpcError

      const friend = friends.value.find((f) => f.friendshipId === friendshipId)
      if (friend) {
        friend.sentToday = true
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'Failed to send coins.') }
    }
  }

  async function removeFriend(friendshipId: string): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('remove_friend', {
        p_friendship_id: friendshipId,
      })
      if (rpcError) throw rpcError
      friends.value = friends.value.filter((f) => f.friendshipId !== friendshipId)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'Failed to remove friend.') }
    }
  }

  function $reset() {
    friends.value = []
    receivedRequests.value = []
    sentRequests.value = []
    isLoading.value = false
  }

  return {
    friends,
    receivedRequests,
    sentRequests,
    isLoading,
    friendCount,
    pendingRequestCount,
    isFriendCapReached,
    fetchFriends,
    fetchRequests,
    sendRequest,
    respondRequest,
    sendCoins,
    removeFriend,
    $reset,
    FRIEND_CAP,
    CLOSENESS_LABELS,
  }
})
