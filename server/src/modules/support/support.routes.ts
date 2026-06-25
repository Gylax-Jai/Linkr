import { Router } from "express";
import { supportContactSchema } from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { postSupportContact } from "./support.controller.js";

export const supportRouter: Router = Router();

supportRouter.post("/contact", requireAuth, validate(supportContactSchema), postSupportContact);
