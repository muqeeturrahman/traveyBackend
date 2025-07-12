import mongoose from "mongoose";
const { Schema } = mongoose;

const contactSchema = Schema(
 {
    name: { type: Schema.Types.String, required:true},
    email: { type: Schema.Types.String, required:true},
    message: { type: Schema.Types.String, required:true},
    
  },
  {
    timestamps: true,
  }
);

const contactModel = mongoose.model("contact", contactSchema);
export default contactModel;
