import type { SupportContactInput } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { createSupportMessage } from "./support.service.js";

/** POST /api/support/contact — save a user support query to MongoDB. */
export const postSupportContact = asyncHandler(async (req, res) => {
  const user = req.user;
  if (!user) throw ApiError.unauthorized();

  const body = req.body as SupportContactInput;
  await createSupportMessage(
    user._id.toString(),
    {
      email: user.email,
      displayName: user.displayName,
      username: user.username,
    },
    body,
  );

  res.status(201).json({ ok: true });
});
