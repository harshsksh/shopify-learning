import { useState, useEffect, useRef } from "react";
import {
  useActionData,
  useLoaderData,
  useSubmit,
  useParams,
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
    };
  }

  const qrCode = await getQRCode(params.id, admin.graphql, session.shop);
  if (!qrCode) {
    throw new Response("QR code not found", { status: 404 });
  }

  return { ...qrCode, shop: session.shop };
};

export const action = async ({ request, params }) => {
  const { admin, redirect } = await authenticate.admin(request);

  if (request.method === "DELETE") {
    const formData = await request.formData();
    const id = formData.get("id");
    await deleteQRCode(id, admin.graphql);
    return redirect("/app");
  }

  const formData = await request.formData();

  const qrCode = {
    title: formData.get("title"),
    product: formData.get("product"),
    productVariant: formData.get("productVariant"),
    destination: formData.get("destination"),
  };

  const errors = validateQRCode(qrCode);

  if (Object.keys(errors).length) {
    return { errors };
  }

  const handle =
    params.id === "new" ? generateHandle(qrCode.title) : params.id;

  await saveQRCode(handle, qrCode, admin.graphql);

  return redirect(`/app/qrcodes/${handle}`);
};

export const ErrorBoundary = boundary.error(async (error) => {
  console.error(error);
  return {
    status: "error",
    message: error instanceof Error ? error.message : "Unknown error occurred",
  };
});

export default function QRCodeForm() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const { id } = useParams();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [formState, setFormState] = useState(loaderData);
  const [initialFormState, setInitialFormState] = useState(loaderData);
  const [isDirty, setIsDirty] = useState(false);

  const imageRef = useRef(null);

  const isCreating = id === "new";
  const isEditing = !isCreating;

  useEffect(() => {
    if (formState !== initialFormState) {
      setIsDirty(true);
    } else {
      setIsDirty(false);
    }
  }, [formState, initialFormState]);

  const selectProduct = async () => {
    shopify?.resourcePicker({
      type: "product",
      action: "select",
      onSelection: (resources) => {
        const { selection } = resources;
        if (selection && selection[0]) {
          const { id, title, images } = selection[0];
          setFormState({
            ...formState,
            product: id,
            productTitle: title,
            productImage: images[0],
          });
        }
      },
    });
  };

  const handleTitleChange = (e) => {
    setFormState({ ...formState, title: e.target.value });
  };

  const handleDestinationChange = (e) => {
    setFormState({ ...formState, destination: e.target.value });
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const submitData = {
      title: formState.title,
      product: formState.product,
      productVariant: formState.productVariant || "",
      destination: formState.destination,
    };

    submit(submitData, { method: "post" });
    setInitialFormState(formState);
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this QR code?")) {
      const formData = new FormData();
      formData.append("id", initialFormState.id);
      submit(formData, { method: "delete" });
    }
  };

  const generateQRCode = async () => {
    if (!formState.product) {
      shopify?.toast.show("Please select a product first");
      return;
    }

    try {
      const handle = id === "new" ? generateHandle(formState.title) : id;
      const qrImage = await getQRCodeImage(handle, formState.shop);
      setFormState({ ...formState, qrImage });
    } catch (error) {
      console.error("Failed to generate QR code:", error);
      shopify?.toast.show("Failed to generate QR code", { isError: true });
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

  // Generate QR code after form loads (for editing)
  useEffect(() => {
    if (isEditing && loaderData?.product && !formState?.qrImage) {
      generateQRCode();
    }
  }, [isEditing, loaderData?.product]);

  const destinationUrl =
    initialFormState?.product && initialFormState?.destination
      ? getDestinationUrl(initialFormState, formState.shop)
      : null;

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

      <form onSubmit={handleSave}>
        <s-section>
          <s-form-item>
            <s-label htmlFor="title">Title</s-label>
            <s-text-field
              id="title"
              type="text"
              value={formState.title || ""}
              onChange={handleTitleChange}
              error={errors.title ? errors.title : undefined}
            />
            {errors.title && <s-text color="critical">{errors.title}</s-text>}
          </s-form-item>

          <s-form-item>
            <s-label>Product</s-label>
            {!formState.product ? (
              <s-button onClick={selectProduct} kind="secondary">
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
            <s-label htmlFor="destination">Destination</s-label>
            <s-select
              id="destination"
              value={formState.destination || "product"}
              onChange={handleDestinationChange}
            >
              <option value="product">Product page</option>
              <option value="cart">Add to cart</option>
            </s-select>
            {errors.destination && (
              <s-text color="critical">{errors.destination}</s-text>
            )}
          </s-form-item>

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
                  <s-button onClick={downloadQRCode} kind="secondary">
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

        <ui-save-bar>
          <s-button type="submit">
            Save
          </s-button>
          <s-button kind="tertiary" onClick={() => setFormState(initialFormState)}>
            Discard
          </s-button>
        </ui-save-bar>
      </form>
    </s-page>
  );
}
