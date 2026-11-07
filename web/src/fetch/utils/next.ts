type NextRequestInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

export const getNoCache = (_queryKey: string): NextRequestInit => ({
  cache: 'no-store',
});

export const getNoStoreRevalidate = (_queryKey: string): NextRequestInit => ({
  cache: 'no-store',
});

export const getRefetchWithCache = (
  queryKey: string,
  revalidate = 60,
): NextRequestInit => ({
  next: {
    revalidate,
    tags: [queryKey],
  },
});
