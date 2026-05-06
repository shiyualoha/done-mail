export async function deleteR2Objects(bucket: R2Bucket | undefined, keys: string[]) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (uniqueKeys.length === 0) return;
  if (!bucket) throw new Error('未启用附件存储，无法删除附件对象');
  await Promise.all(uniqueKeys.map((key) => bucket.delete(key)));
}

export async function deleteR2ObjectsBestEffort(bucket: R2Bucket | undefined, keys: string[]) {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];
  if (!bucket || uniqueKeys.length === 0) return;
  await Promise.allSettled(uniqueKeys.map((key) => bucket.delete(key)));
}
