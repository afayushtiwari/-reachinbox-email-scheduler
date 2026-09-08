import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const devUser = await prisma.user.upsert({
    where: { email: "dev@reachinbox.ai" },
    update: {},
    create: {
      email: "dev@reachinbox.ai",
      name: "Developer User",
      googleId: "dev-google-id-001",
    },
  });

  console.log("Seeded dev user:", devUser);

  const testUser = await prisma.user.upsert({
    where: { email: "test@reachinbox.ai" },
    update: {},
    create: {
      email: "test@reachinbox.ai",
      name: "Test User",
      googleId: "test-google-id-002",
    },
  });

  console.log("Seeded test user:", testUser);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
