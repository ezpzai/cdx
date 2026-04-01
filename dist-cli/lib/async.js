export async function mapSequential(items, mapper) {
    const results = [];
    for (const [index, item] of items.entries()) {
        results.push(await mapper(item, index));
    }
    return results;
}
