import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getQRCodes } from "../models/QRCode.server";

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const qrCodes = await getQRCodes(admin.graphql, session.shop);

  return {
    qrCodes,
  };
}

function truncate(str, length = 25) {
  if (!str) return "";
  return str.length > length ? str.substring(0, length) + "..." : str;
}

const EmptyQRCodeState = () => (
  <s-section accessibilityLabel="Empty state section">
    <s-grid gap="base" justifyItems="center" paddingBlock="large-400">
      <s-box maxInlineSize="200px" maxBlockSize="200px">
        <s-image
          aspectRatio="1/0.5"
          src="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          alt="A stylized graphic of a document"
        />
      </s-box>
      <s-heading>Create QR codes for your products</s-heading>
      <s-paragraph>
        Track and share QR codes that link to your products or checkout
      </s-paragraph>
      <s-button href="/app/qrcodes/new" kind="primary">
        Create QR code
      </s-button>
    </s-grid>
  </s-section>
);

export default function Index() {
  const { qrCodes } = useLoaderData();

  return (
    <s-page>
      <s-page-title>QR codes</s-page-title>
      
      <s-page-actions>
        <s-button href="/app/qrcodes/new" kind="primary">
          Create QR code
        </s-button>
      </s-page-actions>

      {qrCodes.length === 0 ? (
        <EmptyQRCodeState />
      ) : (
        <s-section>
          <s-table>
            <s-table-header>
              <s-table-cell listSlot="primary">Title</s-table-cell>
              <s-table-cell>Product</s-table-cell>
              <s-table-cell>Created</s-table-cell>
              <s-table-cell>Scans</s-table-cell>
            </s-table-header>
            {qrCodes.map((qrCode) => (
              <s-table-row key={qrCode.handle} href={`/app/qrcodes/${qrCode.handle}`}>
                <s-table-cell listSlot="primary">
                  <s-link href={`/app/qrcodes/${qrCode.handle}`}>
                    {truncate(qrCode.title)}
                  </s-link>
                </s-table-cell>
                <s-table-cell>
                  <s-stack>
                    {qrCode.productImage && (
                      <s-image
                        src={qrCode.productImage.url}
                        alt={qrCode.productImage.altText || "Product image"}
                        maxWidth="50px"
                      />
                    )}
                    <s-text>
                      {qrCode.productDeleted ? (
                        <>
                          <s-badge kind="warning">
                            Product deleted
                          </s-badge>
                          {qrCode.productTitle}
                        </>
                      ) : (
                        truncate(qrCode.productTitle)
                      )}
                    </s-text>
                  </s-stack>
                </s-table-cell>
                <s-table-cell>
                  {new Date(qrCode.createdAt).toLocaleDateString()}
                </s-table-cell>
                <s-table-cell>{qrCode.scans}</s-table-cell>
              </s-table-row>
            ))}
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
