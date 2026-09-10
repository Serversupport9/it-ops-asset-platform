import { api } from "./api";

export async function getMetabaseEmbedUrl(): Promise<string> {
  const response = await api.get<{ embed_url: string }>("/api/v1/dashboard/embed-url");
  return response.data.embed_url;
}
