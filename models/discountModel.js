import mongoose from "mongoose";
const { Schema } = mongoose;

const discountSchema = new Schema(
  {
    flightDiscount: {
      type: Number, // Use Number for easy calculations
      default: 0,
    },
    hotelDiscount: {
      type: Number,
      default: 0,
    },
    carDiscount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const DiscountModel = mongoose.model("Discount", discountSchema);
export default DiscountModel;
