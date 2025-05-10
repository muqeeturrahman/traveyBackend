import mongoose from "mongoose";
const { Schema } = mongoose;

const deviceSchema = Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "users",
    },
    deviceToken: { type: Schema.Types.String, default: "" },

    deviceType: {
      type: Schema.Types.String,
      enum: ["android", "ios", "web", "postman"],
    },
  },
  {
    timestamps: true,
  }
);

const DeviceModel = mongoose.model("Device", deviceSchema);
export default DeviceModel;
