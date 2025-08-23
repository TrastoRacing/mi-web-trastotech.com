import { getCollection } from 'astro:content';

export const getPosts = async () => await getCollection('blog')

export const getPostSortedByDate = async () => (await getPosts()).sort(
    ({ data: { pubDate: pubDateA } },{ data: { pubDate: pubDateB } }) => pubDateB.valueOf() - pubDateA.valueOf(),
)

export const getSanitizedString = (data: string) =>
    data.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

export const getPostUrl = (title: string, site?: URL) => `${site}blog/${getSanitizedString(title)}`
