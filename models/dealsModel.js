import mongoose from "mongoose";
const { Schema } = mongoose;

const dealsSchema = Schema(
    {
        title: {
            type: String,
            required: true
        },
        picture: {
            type: String,

        },
        aboutThisTour: {
            type: String,
            required: true
        },
        highlights: [
            {
                type: String,
                required: true
            }
        ],
        included: [
            {
                type: String,
                required: true
            }
        ],
        excluded: [
            {
                type: String,
                required: true
            }
        ],
    },
    {
        timestamps: true,
    }
);

const dealsModel = mongoose.model("deals", dealsSchema);
export default dealsModel;
