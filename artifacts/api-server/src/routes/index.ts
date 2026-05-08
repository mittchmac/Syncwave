import { Router, type IRouter } from "express";
import healthRouter from "./health";
import golfRouter from "./golf";

const router: IRouter = Router();

router.use(healthRouter);
router.use(golfRouter);

export default router;
