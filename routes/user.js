import express from "express"
import { flightOffers, getToken } from "../controller/userController.js"

const userRouter = express.Router()
userRouter.route("/getToken").post(getToken)
userRouter.route("/flightOffers").post(flightOffers)

export default userRouter
