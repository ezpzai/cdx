export async function mapSequential<T, R>(
  items: readonly T[],
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];

  for (const [index, item] of items.entries()) {
    results.push(await mapper(item, index));
  }

  return results;
}
