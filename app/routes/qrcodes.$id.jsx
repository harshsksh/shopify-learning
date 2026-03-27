import invariant from "tiny-invariant";
import { useLoaderData } from "react-router";

import { unauthenticated } from "../shopify.server";
import { getQRCodeImage } from "../models/QRCode.server";

export const loader = async ({ request, params }) => {
  invariant(params.id, "Could not find QR code destination");

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  invariant(shop, "Missing shop parameter");

  const { admin } = await unauthenticated.admin(shop);

  const response = await admin.graphql(
    `
      query GetQRCodeTitle($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          title: field(key: "title") { value }
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

  const title = data.metaobjectByHandle.title?.value || "QR Code";
  const qrImage = await getQRCodeImage(params.id, shop);

  return {
    title,
    qrImage,
  };
};

export default function QRCode() {
  const { title, qrImage } = useLoaderData();

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <img
        src={qrImage}
        alt={title}
        style={{ maxWidth: "500px", width: "100%" }}
      />
    </div>
  );
}
