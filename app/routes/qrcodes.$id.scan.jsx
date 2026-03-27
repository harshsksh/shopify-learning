import { redirect } from "react-router";
import invariant from "tiny-invariant";

import { unauthenticated } from "../shopify.server";
import {
  getDestinationUrl,
  incrementQRCodeScans,
} from "../models/QRCode.server";

export const loader = async ({ request, params }) => {
  invariant(params.id, "Could not find QR code destination");

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  invariant(shop, "Missing shop parameter");

  const { admin } = await unauthenticated.admin(shop);

  const response = await admin.graphql(
    `
      query GetQRCodeScan($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
          product: field(key: "product") {
            reference {
              ... on Product { handle }
            }
          }
          productVariant: field(key: "product_variant") {
            reference {
              ... on ProductVariant { legacyResourceId }
            }
          }
          destination: field(key: "destination") { value }
          scans: field(key: "scans") { value }
        }
      }
    `,
    {
      variables: {
        handle: { type: "$app:qrcode", handle: params.id },
      },
    }
  );

  const { data } = await response.json();

  invariant(data?.metaobjectByHandle, "Could not find QR code");

  const metaobject = data.metaobjectByHandle;
  const scans = parseInt(metaobject.scans?.value || "0", 10);

  const qrCode = {
    id: metaobject.id,
    productHandle: metaobject.product?.reference?.handle,
    productVariant: metaobject.productVariant?.reference,
    destination: metaobject.destination?.value,
  };

  // Increment scan count
  try {
    await incrementQRCodeScans(qrCode.id, scans, admin.graphql);
  } catch (error) {
    console.error("Failed to increment scans:", error);
    // Continue even if increment fails
  }

  // Get destination URL
  const destinationUrl = getDestinationUrl(qrCode, shop);

  return redirect(destinationUrl);
};

export default function QRCodeScan() {
  // This component is never rendered because the loader redirects
  return null;
}
