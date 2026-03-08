export async function getOpfsRootDirectory() {
  const nav = navigator as Navigator & {
    storage?: StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }
  }
  const getDirectory = nav.storage?.getDirectory
  if (typeof getDirectory !== "function") throw new Error("OPFS is not available in this environment")
  return await getDirectory.call(nav.storage)
}

export async function estimateStorageUsage() {
  const nav = navigator as Navigator & { storage?: StorageManager }
  const estimate = nav.storage?.estimate
  if (typeof estimate !== "function") return null
  return await estimate.call(nav.storage)
}
