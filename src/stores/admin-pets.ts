import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'
import { usePetsStore, type Pet, type PetRarity } from './pets'

export const useAdminPetsStore = defineStore('adminPets', () => {
  // Admin PetsPage state (persisted across navigation)
  const adminPetsFilters = ref({
    search: '',
  })

  function setAdminPetsSearch(search: string) {
    adminPetsFilters.value.search = search
  }

  // Add a new pet (admin only)
  async function createPet(pet: {
    name: string
    rarity: PetRarity
    imagePath: string
    tier2ImagePath?: string | null
    tier3ImagePath?: string | null
  }): Promise<{ pet: Pet | null; error: string | null }> {
    try {
      const { data, error: insertError } = await supabase
        .from('pets')
        .insert({
          name: pet.name,
          rarity: pet.rarity,
          image_path: pet.imagePath,
          tier2_image_path: pet.tier2ImagePath ?? null,
          tier3_image_path: pet.tier3ImagePath ?? null,
        })
        .select()
        .single()

      if (insertError) {
        return { pet: null, error: handleError(insertError, 'Failed to create pet.') }
      }

      const newPet: Pet = {
        id: data.id,
        name: data.name,
        rarity: data.rarity,
        imagePath: data.image_path,
        tier2ImagePath: data.tier2_image_path,
        tier3ImagePath: data.tier3_image_path,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      }

      const petsStore = usePetsStore()
      petsStore.allPets.push(newPet)
      return { pet: newPet, error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to create pet.')
      return { pet: null, error: message }
    }
  }

  // Update a pet (admin only)
  async function updatePet(
    petId: string,
    updates: {
      name?: string
      rarity?: PetRarity
      imagePath?: string
      tier2ImagePath?: string | null
      tier3ImagePath?: string | null
    },
  ): Promise<{ error: string | null }> {
    try {
      const updateData: Record<string, unknown> = {}
      if (updates.name !== undefined) updateData.name = updates.name
      if (updates.rarity !== undefined) updateData.rarity = updates.rarity
      if (updates.imagePath !== undefined) updateData.image_path = updates.imagePath
      if (updates.tier2ImagePath !== undefined) updateData.tier2_image_path = updates.tier2ImagePath
      if (updates.tier3ImagePath !== undefined) updateData.tier3_image_path = updates.tier3ImagePath

      const { data: updatedData, error: updateError } = await supabase
        .from('pets')
        .update(updateData)
        .eq('id', petId)
        .select('updated_at')
        .single()

      if (updateError) {
        return { error: handleError(updateError, 'Failed to update pet.') }
      }

      // Update local state in shared store
      const petsStore = usePetsStore()
      const index = petsStore.allPets.findIndex((p) => p.id === petId)
      if (index !== -1) {
        const pet = petsStore.allPets[index]
        if (pet) {
          if (updates.name !== undefined) pet.name = updates.name
          if (updates.rarity !== undefined) pet.rarity = updates.rarity
          if (updates.imagePath !== undefined) pet.imagePath = updates.imagePath
          if (updates.tier2ImagePath !== undefined) pet.tier2ImagePath = updates.tier2ImagePath
          if (updates.tier3ImagePath !== undefined) pet.tier3ImagePath = updates.tier3ImagePath
          // Update the updatedAt for cache busting
          pet.updatedAt = updatedData?.updated_at ?? new Date().toISOString()
        }
      }

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to update pet.')
      return { error: message }
    }
  }

  // Delete a pet (admin only)
  async function deletePet(petId: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('pets').delete().eq('id', petId)

      if (deleteError) {
        return { error: handleError(deleteError, 'Failed to delete pet.') }
      }

      // Remove from shared store
      const petsStore = usePetsStore()
      const index = petsStore.allPets.findIndex((p) => p.id === petId)
      if (index !== -1) {
        petsStore.allPets.splice(index, 1)
      }

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to delete pet.')
      return { error: message }
    }
  }

  // Upload pet image to storage
  async function uploadPetImage(
    file: File,
    oldPath?: string | null,
  ): Promise<{ path: string | null; error: string | null }> {
    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('pet-images')
        .upload(filePath, file, {
          cacheControl: '31536000',
        })

      if (uploadError) {
        return { path: null, error: handleError(uploadError, 'Failed to upload image.') }
      }

      // Clean up old file
      if (oldPath) {
        supabase.storage.from('pet-images').remove([oldPath])
      }

      return { path: filePath, error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to upload image.')
      return { path: null, error: message }
    }
  }

  function $reset() {
    adminPetsFilters.value = { search: '' }
  }

  return {
    adminPetsFilters,
    setAdminPetsSearch,
    createPet,
    updatePet,
    deletePet,
    uploadPetImage,
    $reset,
  }
})
