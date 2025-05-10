import mongoose from "mongoose";
const { Schema } = mongoose;

const tokenSchema = new Schema(
  {
    type: {
      type: String,
    },
    username: {
      type: String,
    },
    application_name: {
      type: String,
    },
    client_id: {
      type: String,
    },
    token_type: {
      type: String,
    },
    access_token: {
      type: String,
    },
    expiresAt: {
      type: Number,
    },
    state: {
      type: String,
    },
    scope: {
      type: String,
    },
    createdAt: {
      type: Date,
      require: true
    },
  },
  {
    timestamps: true,
  }
);

const tokenModel = mongoose.model("token", tokenSchema);
export default tokenModel;
