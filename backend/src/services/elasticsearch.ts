import { Client } from "@elastic/elasticsearch";
import { config } from "../config";

let esClient: Client | null = null;

export function getElasticsearchClient(): Client {
  if (!esClient) {
    esClient = new Client({ node: config.elasticsearch.url });
  }
  return esClient;
}

const INDEX_NAME = "email_jobs";

export async function initializeElasticsearch(): Promise<void> {
  const client = getElasticsearchClient();

  try {
    const exists = await client.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      await client.indices.create({
        index: INDEX_NAME,
        settings: {
          number_of_shards: 1,
          number_of_replicas: 0,
        },
        mappings: {
          properties: {
            id: { type: "keyword" },
            userId: { type: "keyword" },
            recipientEmail: {
              type: "text",
              analyzer: "simple",
              fields: { keyword: { type: "keyword" } },
            },
            senderEmail: {
              type: "text",
              analyzer: "simple",
              fields: { keyword: { type: "keyword" } },
            },
            subject: { type: "text", analyzer: "standard" },
            body: { type: "text", analyzer: "standard" },
            status: { type: "keyword" },
            scheduledAt: { type: "date" },
            sentAt: { type: "date" },
            createdAt: { type: "date" },
          },
        },
      });
      console.log(`Created Elasticsearch index: ${INDEX_NAME}`);
    }
  } catch (error: any) {
    console.error("Elasticsearch initialization error:", error.message);
  }
}

export async function indexEmailJob(job: {
  id: string;
  userId: string;
  recipientEmail: string;
  senderEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledAt: Date;
  sentAt?: Date | null;
  createdAt: Date;
}): Promise<void> {
  const client = getElasticsearchClient();
  try {
    await client.index({
      index: INDEX_NAME,
      id: job.id,
      document: {
        ...job,
        sentAt: job.sentAt || null,
      },
    });
  } catch (error: any) {
    console.error("Elasticsearch index error:", error.message);
  }
}

export async function updateEmailJobStatus(
  id: string,
  updates: { status: string; sentAt?: Date; errorMessage?: string }
): Promise<void> {
  const client = getElasticsearchClient();
  try {
    await client.update({
      index: INDEX_NAME,
      id,
      doc: updates,
    });
  } catch (error: any) {
    console.error("Elasticsearch update error:", error.message);
  }
}

export async function searchEmails(
  userId: string,
  query: string,
  page: number = 1,
  limit: number = 20
): Promise<{ hits: any[]; total: number }> {
  const client = getElasticsearchClient();
  try {
    const result = await client.search({
      index: INDEX_NAME,
      query: {
        bool: {
          must: [{ term: { userId } }],
          should: [
            { match: { subject: { query, boost: 2 } } },
            { match: { body: { query, boost: 1 } } },
            { match: { recipientEmail: { query, boost: 1.5 } } },
            { match: { senderEmail: { query, boost: 1.5 } } },
          ],
          minimum_should_match: 1,
        },
      },
      from: (page - 1) * limit,
      size: limit,
      sort: [{ createdAt: { order: "desc" } }],
    });

    const total =
      typeof result.hits.total === "number" ? result.hits.total : result.hits.total?.value || 0;

    return {
      hits: result.hits.hits.map((hit: any) => ({ ...hit._source, _score: hit._score })),
      total,
    };
  } catch (error: any) {
    console.error("Elasticsearch search error:", error.message);
    return { hits: [], total: 0 };
  }
}