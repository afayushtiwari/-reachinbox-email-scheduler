import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { config } from "../config";
import prisma from "./prisma";

const googleClient = new OAuth2Client(
  config.google.clientId,
  config.google.clientSecret
);

export async function verifyGoogleToken(idToken: string) {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: config.google.clientId,
  });

  const payload = ticket.getPayload();
  if (!payload) {
    throw new Error("Invalid Google token");
  }

  return {
    googleId: payload.sub,
    email: payload.email!,
    name: payload.name || "",
    avatar: payload.picture || "",
  };
}

export async function findOrCreateUser(googleUserData: {
  googleId: string;
  email: string;
  name: string;
  avatar: string;
}) {
  let user = await prisma.user.findUnique({
    where: { googleId: googleUserData.googleId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: googleUserData.googleId,
        email: googleUserData.email,
        name: googleUserData.name,
        avatar: googleUserData.avatar,
      },
    });
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: googleUserData.name,
        avatar: googleUserData.avatar,
      },
    });
  }

  return user;
}

export function generateJWT(userId: string, email: string): string {
  return jwt.sign({ userId, email }, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyJWT(token: string): { userId: string; email: string } {
  return jwt.verify(token, config.jwtSecret) as { userId: string; email: string };
}
