import { getCollection } from 'astro:content';

export const getPosts = async () => await getCollection('blog')

export const getPostSortedByDate = async () => (await getPosts()).sort(
    ({ data: { pubDate: pubDateA } },{ data: { pubDate: pubDateB } }) => pubDateB.valueOf() - pubDateA.valueOf(),
)