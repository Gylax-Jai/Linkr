import { z } from "zod";
import {
  CHAT_TYPES,
  FRIENDSHIP_STATUSES,
  MESSAGE_STATUSES,
  MESSAGE_TYPES,
  VISIBILITY_VALUES,
} from "../constants/limits.js";

export const visibilitySchema = z.enum(VISIBILITY_VALUES);
export const friendshipStatusSchema = z.enum(FRIENDSHIP_STATUSES);
export const messageTypeSchema = z.enum(MESSAGE_TYPES);
export const messageStatusSchema = z.enum(MESSAGE_STATUSES);
export const chatTypeSchema = z.enum(CHAT_TYPES);
