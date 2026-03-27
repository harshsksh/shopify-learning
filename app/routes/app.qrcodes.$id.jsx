import { useState, useEffect } from "react";
import {
  useActionData,
  useLoaderData,
  useSubmit,
  useParams,
  useRouteError,
} from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

import {
  getQRCode,
  validateQRCode,
  saveQRCode,
  deleteQRCode,
  generateHandle,
  getQRCodeImage,
  getDestinationUrl,
} from "../models/QRCode.server";

export const loader = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);

  if (params.id === "new") {
    return {
      destination: "product",
      title: "",
      shop: session.shop,
      qrImage: null,
      destinationUrl: null,
    };
  }

  const qrCode = await getQRCode(params.id, admin.graphql, session.shop);
  if (!qrCode) {
    throw new Response("QR code not found", { status: 404 });
  }

  const qrImage = await getQRCodeImage(qrCode.handle, session.shop);
  const destinationUrl = getDestinationUrl(qrCode, session.shop);

  return { ...qrCode, qrImage, destinationUrl, shop: session.shop };
};

export const action = async ({ request, params }) => {
  console.log("=== QR ACTION HANDLER ===", request.method);
  const { admin, redirect } = await authenticate.admin(request);

  if (request.method === "DELETE") {
    const formData = await request.formData();
    const id = formData.get("id");
    await deleteQRCode(id, admin.graphql);
    return redirect("/app");
  }

  const formData = await request.formData();
  console.log("Form data received:", {
    title: formData.get("title"),
    product: formData.get("product"),
    productVariant: formData.get("productVariant"),
    destination: formData.get("destination"),
  });

  const qrCode = {
    title: formData.get("title"),
    product: formData.get("product"),
    productVariant: formData.get("productVariant"),
    destination: formData.get("destination"),
  };

  console.log("Validating QR code:", qrCode);
  const errors = validateQRCode(qrCode);
  console.log("Validation errors:", errors);

  if (Object.keys(errors).length) {
    console.log("Returning validation errors to UI");
    return { errors };
  }

  const handle =
    params.id === "new" ? generateHandle(qrCode.title) : params.id;

  console.log("Saving QR code with handle:", handle);
  try {
    await saveQRCode(handle, qrCode, admin.graphql);
    console.log("QR code saved successfully");
  } catch (error) {
    console.error("Save failed:", error?.message);
    return {
      errors: {
        form: error?.message || "Failed to save QR code",
      },
    };
  }

  console.log("Redirecting to:", `/app/qrcodes/${handle}`);
  return redirect(`/app/qrcodes/${handle}`);
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export default function QRCodeForm() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const { id } = useParams();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [formState, setFormState] = useState(loaderData);
  const [initialFormState, setInitialFormState] = useState(loaderData);

  const isCreating = id === "new";
  const isEditing = !isCreating;

  const selectProduct = async () => {
    const result = await shopify?.resourcePicker({
      type: "product",
      action: "select",
      multiple: false,
    });

    const selection = Array.isArray(result)
      ? result
      : result?.selection || [];

    if (selection[0]) {
      const { id, title, images } = selection[0];
      setFormState((prev) => ({
        ...prev,
        product: id,
        productTitle: title,
        productImage: images?.[0],
      }));
    }
  };

  const handleTitleChange = (e) => {
    setFormState((prev) => ({ ...prev, title: e.target.value }));
  };

  const handleDestinationChange = (e) => {
    setFormState((prev) => ({ ...prev, destination: e.target.value }));
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this QR code?")) {
      const formData = new FormData();
      formData.append("id", initialFormState.id);
      submit(formData, { method: "delete" });
    }
  };

  const downloadQRCode = () => {
    if (!formState?.qrImage) {
      shopify?.toast.show("Please generate a QR code first");
      return;
    }

    const link = document.createElement("a");
    link.href = formState.qrImage;
    link.download = `qr-code-${formState.title || "qrcode"}.png`;
    link.click();
  };

  const errors = actionData?.errors || {};

  useEffect(() => {
    setFormState(loaderData);
    setInitialFormState(loaderData);
  }, [loaderData]);

  const destinationUrl = formState?.destinationUrl || null;

  return (
    <s-page>
      <s-page-title>
        {isCreating ? "Create QR code" : "Edit QR code"}
      </s-page-title>

      {isEditing && (
        <s-page-breadcrumbs items={[{ label: "QR codes", url: "/app" }]} />
      )}

      <s-page-actions>
        {isEditing && (
          <s-button onClick={handleDelete} kind="destructive">
            Delete
          </s-button>
        )}
      </s-page-actions>

      <s-form
        method="post"
        onSubmit={(e) => {
          console.log("=== FORM SUBMIT ===", {
            title: formState.title,
            product: formState.product,
            destination: formState.destination,
          });
          setInitialFormState(formState);
        }}
      >
        <input type="hidden" name="product" value={formState.product || ""} />
        <input
          type="hidden"
          name="productVariant"
          value={formState.productVariant || ""}
        />
        <s-section>
          <s-form-item>
            <label htmlFor="title">Title</label>
            <input
              id="title"
              name="title"
              type="text"
              value={formState.title || ""}
              onChange={handleTitleChange}
              style={{ width: "100%", padding: "8px", marginTop: "6px" }}
            />
            {errors.title && <s-text color="critical">{errors.title}</s-text>}
          </s-form-item>

          <s-form-item>
            <s-label>Product</s-label>
            {!formState.product ? (
              <s-button type="button" onClick={selectProduct} kind="secondary">
                Select product
              </s-button>
            ) : (
              <s-clickable>
                <s-box padding="base">
                  <s-stack>
                    {formState.productImage && (
                      <s-image
                        src={formState.productImage.originalSrc}
                        alt={formState.productImage.altText || "Product image"}
                        maxWidth="100px"
                      />
                    )}
                    <s-text>{formState.productTitle}</s-text>
                    <s-button
                      type="button"
                      onClick={selectProduct}
                      kind="tertiary"
                      size="small"
                    >
                      Change
                    </s-button>
                  </s-stack>
                </s-box>
              </s-clickable>
            )}
            {errors.product && (
              <s-text color="critical">{errors.product}</s-text>
            )}
          </s-form-item>

          <s-form-item>
            <label htmlFor="destination">Destination</label>
            <select
              id="destination"
              name="destination"
              value={formState.destination || "product"}
              onChange={handleDestinationChange}
              style={{ width: "100%", padding: "8px", marginTop: "6px" }}
            >
              <option value="product">Product page</option>
              <option value="cart">Add to cart</option>
            </select>
            {errors.destination && (
              <s-text color="critical">{errors.destination}</s-text>
            )}
          </s-form-item>

          {errors.form && (
            <s-form-item>
              <s-text color="critical">{errors.form}</s-text>
            </s-form-item>
          )}

          {destinationUrl && (
            <s-form-item>
              <s-link href={destinationUrl} target="_blank">
                Go to destination
              </s-link>
            </s-form-item>
          )}
        </s-section>

        <s-section slot="aside">
          <s-box>
            {formState?.qrImage ? (
              <>
                <s-image src={formState.qrImage} alt="QR code preview" />
                <s-text size="small" color="subdued" marginBlock="base">
                  Scan this QR code with your phone camera.
                </s-text>
                <s-stack>
                  <s-button type="button" onClick={downloadQRCode} kind="secondary">
                    Download QR code
                  </s-button>
                  {destinationUrl && (
                    <s-link href={destinationUrl} target="_blank">
                      Preview
                    </s-link>
                  )}
                </s-stack>
              </>
            ) : (
              <s-text color="subdued">
                Save the QR code to preview it
              </s-text>
            )}
          </s-box>
        </s-section>

        <s-section>
          <s-stack direction="inline" gap="small-200">
            <s-button type="submit" kind="primary">
              Save
            </s-button>
            <s-button
              type="button"
              kind="tertiary"
              onClick={() => setFormState(initialFormState)}
            >
              Discard
            </s-button>
          </s-stack>
        </s-section>
      </s-form>
    </s-page>
  );
}
