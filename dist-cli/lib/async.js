export async function mapConcurrent(items, mapper) {
    return Promise.all(items.map((item, index) => mapper(item, index)));
}
