import checkoutNodeJssdk from '@paypal/checkout-server-sdk';
import dotenv from "dotenv";
dotenv.config();

// Debug: Print credentials to console (remove in production)
console.log("PayPal Client ID:", process.env.PAYPAL_CLIENT_ID);
console.log("PayPal Client Secret:", process.env.PAYPAL_CLIENT_SECRET);

function environment() {
  let clientId = process.env.PAYPAL_CLIENT_ID;
  let clientSecret = process.env.PAYPAL_CLIENT_SECRET;


  // Switch to LiveEnvironment for production
  return new checkoutNodeJssdk.core.LiveEnvironment(clientId, clientSecret);
}

function client() {
  return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
}

export { client, checkoutNodeJssdk };