export async function mapConcurrent<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  return Promise.all(items.map((item, index) => mapper(item, index)));
}
