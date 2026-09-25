// Profile pictures uploaded while the mocks run: user id → the image and a version for ?v=.
const avatars = new Map<number, { blob: Blob; version: number }>()

export const mockAvatarUrl = (userId: number) => {
  const avatar = avatars.get(userId)
  return avatar ? `/api/users/${userId}/avatar?v=${avatar.version}` : null
}

export const setMockAvatar = (userId: number, blob: Blob) => avatars.set(userId, { blob, version: Date.now() })

export const removeMockAvatar = (userId: number) => avatars.delete(userId)

export const getMockAvatar = (userId: number) => avatars.get(userId)?.blob
