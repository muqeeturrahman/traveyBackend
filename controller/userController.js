import express from "express"
import axios from "axios"
import dotenv from "dotenv"
import tokenModel from "../models/token.js"
dotenv.config()

const getAccessToken = async () => {
  const tokenData = await tokenModel.findOne({}).sort({ createdAt: -1 });
  console.log(tokenData,"token>>>>>>>>>>>>");
  

  
if (!tokenData) {
    throw new Error("No token found");
  }

  const now = Date.now();
  const nowInSeconds = Math.floor(now / 1000);
  const createdAtInSeconds = Math.floor(new Date(tokenData.createdAt).getTime() / 1000);
  const expiryTime = createdAtInSeconds + tokenData.expiresAt;

  if (tokenData.access_token && expiryTime > nowInSeconds) {
    console.log("already token>>>>>>>>>>");
    
    return tokenData.access_token;
  } else {
    const response = await axios.post(
      'https://test.api.amadeus.com/v1/security/oauth2/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_CLIENT_ID,
        client_secret: process.env.AMADEUS_CLIENT_SECRET,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const newAccessToken = response.data.access_token;
    const newExpiresIn = response.data.expires_in;

    // Update token in DB
    await tokenModel.findByIdAndUpdate(tokenData._id, {
      access_token: newAccessToken,
      expiresAt: newExpiresIn,
      createdAt: new Date() // Force update createdAt
    });

    return newAccessToken;
  }
};
export const flightOffers = async (req, res, next) => {
  try {
    // ✅ Get valid token (will refresh if needed)
    const token = await getAccessToken()
    console.log("✅ Token used:", token);

    const { originLocationCode, destinationLocationCode, departureDate, adults,max } = req.body;
console.log(originLocationCode,">>>>>");


    const response = await axios.get(
      "https://test.api.amadeus.com/v2/shopping/flight-offers",
      {
        params: {
          originLocationCode: originLocationCode,
          destinationLocationCode: destinationLocationCode,
          departureDate: departureDate,
          adults: adults || 1,
          currencyCode: "USD",
          max: max,
        },
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json", // optional but good to include
        },
      }
    );

    return res.status(200).json({
      data: response.data,
      success: true,
      message: "Flight offers fetched successfully",
    });
  } catch (error) {
    console.error("❌ Error in flightOffers:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: error.response.data,
        message: error.response.statusText,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: error.message,
        message: "Server error while fetching flight offers",
      });
    }
  }
};

export const getToken = async (req, res, next) => {
  try {
    const tokenData = await tokenModel.findOne({}).sort({ createdAt: -1 });

    if (!tokenData) {
      return res.status(404).json({
        success: false,
        message: "No token found",
      });
    }

    const nowInSeconds = Math.floor(Date.now() / 1000); // Convert to seconds
    const createdAtInSeconds = Math.floor(new Date(tokenData.createdAt).getTime() / 1000);
    const expiryTime = createdAtInSeconds + tokenData.expiresAt;

    if (tokenData.access_token && expiryTime > nowInSeconds) {
      return res.status(200).json({
        data: tokenData,
        success: true,
        message: "token",
      });
    } else {
      return res.status(401).json({
        success: false,
        message: "Token expired",
      });
    }
  } catch (error) {
    next(error);
  }
};


