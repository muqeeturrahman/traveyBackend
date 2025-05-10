import dotenv from "dotenv"
dotenv.config()

const emailConfig = {
  pool: true,
  port: 465,
  secure: true,
  host: process.env.MAIL_HOST,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
};

export default emailConfig
