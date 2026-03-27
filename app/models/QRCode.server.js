import qrcode from "qrcode";
import invariant from "tiny-invariant";

const METAOBJECT_TYPE = "$app:qrcode";

export async function getQRCode(handle, graphql, shop) {
  const response = await graphql(
    `
      query GetQRCode($handle: MetaobjectHandleInput!) {
        metaobjectByHandle(handle: $handle) {
          id
          handle
          updatedAt
          title: field(key: "title") { jsonValue }
          product: field(key: "product") {
            jsonValue
            reference {
              ... on Product {
                handle
                title
                media(first: 1) {
                  nodes {
                    preview {
                      image { url altText }
                    }
                  }
                }
              }
            }
          }
          productVariant: field(key: "product_variant") {
            reference {
              ... on ProductVariant { id legacyResourceId }
            }
          }
          destination: field(key: "destination") { jsonValue }
          scans: field(key: "scans") { jsonValue }
        }
      }
    `,
    {
      variables: {
        handle: { type: METAOBJECT_TYPE, handle },
      },
    }
  );

  const { data } = await response.json();

  if (!data || !data.metaobjectByHandle) {
    return null;
  }

  const metaobject = data.metaobjectByHandle;
  
  return {
    id: metaobject.id,
    handle: metaobject.handle,
    title: metaobject.title?.jsonValue,
    product: metaobject.product?.reference,
    productHandle: metaobject.product?.reference?.handle,
    productTitle: metaobject.product?.reference?.title,
    productImage: metaobject.product?.reference?.media?.nodes?.[0]?.preview?.image,
    productDeleted: !metaobject.product?.reference && metaobject.product?.jsonValue,
    productVariant: metaobject.productVariant?.reference,
    destination: metaobject.destination?.jsonValue,
    scans: metaobject.scans?.jsonValue || 0,
    createdAt: metaobject.updatedAt,
  };
}

export async function getQRCodes(graphql, shop) {
  const response = await graphql(
    `
      query GetQRCodes {
        metaobjects(type: "${METAOBJECT_TYPE}", first: 100) {
          nodes {
            id
            handle
            updatedAt
            title: field(key: "title") { jsonValue }
            product: field(key: "product") {
              jsonValue
              reference {
                ... on Product {
                  handle
                  title
                  media(first: 1) {
                    nodes {
                      preview {
                        image { url altText }
                      }
                    }
                  }
                }
              }
            }
            productVariant: field(key: "product_variant") {
              reference {
                ... on ProductVariant { id legacyResourceId }
              }
            }
            destination: field(key: "destination") { jsonValue }
            scans: field(key: "scans") { jsonValue }
          }
        }
      }
    `
  );

  const { data } = await response.json();

  return (
    data?.metaobjects?.nodes?.map((metaobject) => ({
      id: metaobject.id,
      handle: metaobject.handle,
      title: metaobject.title?.jsonValue,
      product: metaobject.product?.reference,
      productHandle: metaobject.product?.reference?.handle,
      productTitle: metaobject.product?.reference?.title,
      productImage: metaobject.product?.reference?.media?.nodes?.[0]?.preview?.image,
      productDeleted: !metaobject.product?.reference && metaobject.product?.jsonValue,
      productVariant: metaobject.productVariant?.reference,
      destination: metaobject.destination?.jsonValue,
      scans: metaobject.scans?.jsonValue || 0,
      createdAt: metaobject.updatedAt,
    })) || []
  );
}

export async function getQRCodeImage(handle, shop) {
  const qrUrl = new URL(`https://${shop}/qrcodes/${handle}/scan`);
  qrUrl.searchParams.append("shop", shop);
  
  return qrcode.toDataURL(qrUrl.toString());
}

export function getDestinationUrl(qrCode, shop) {
  const url = new URL(`https://${shop}`);
  
  if (qrCode.destination === "product") {
    url.pathname = `/products/${qrCode.productHandle}`;
  } else if (qrCode.destination === "cart") {
    url.pathname = "/cart";
    
    const variantId = qrCode.productVariant?.legacyResourceId;
    if (variantId) {
      url.searchParams.append("items[id]", variantId);
      url.searchParams.append("items[quantity]", "1");
    }
  }
  
  return url.toString();
}

export async function saveQRCode(handle, formData, graphql) {
  const response = await graphql(
    `
      mutation SaveQRCode($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
        metaobjectUpsert(handle: $handle, metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        handle: {
          type: METAOBJECT_TYPE,
          handle,
        },
        metaobject: {
          fields: [
            {
              key: "title",
              value: formData.title,
            },
            {
              key: "product",
              value: formData.product,
            },
            {
              key: "product_variant",
              value: formData.productVariant,
            },
            {
              key: "destination",
              value: formData.destination,
            },
          ],
        },
      },
    }
  );

  const { data, errors } = await response.json();

  if (errors || data?.metaobjectUpsert?.userErrors?.length) {
    throw new Error(
      data?.metaobjectUpsert?.userErrors?.[0]?.message || "Failed to save QR code"
    );
  }

  return data.metaobjectUpsert.metaobject;
}

export async function deleteQRCode(id, graphql) {
  const response = await graphql(
    `
      mutation DeleteQRCode($input: MetaobjectDeleteInput!) {
        metaobjectDelete(input: $input) {
          deletedId
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        input: {
          id: id,
        },
      },
    }
  );

  const { data, errors } = await response.json();

  if (errors || data?.metaobjectDelete?.userErrors?.length) {
    throw new Error(
      data?.metaobjectDelete?.userErrors?.[0]?.message || "Failed to delete QR code"
    );
  }

  return data.metaobjectDelete.deletedId;
}

export async function incrementQRCodeScans(id, scans, graphql) {
  const response = await graphql(
    `
      mutation UpdateQRCodeScans($input: MetaobjectUpdateInput!) {
        metaobjectUpdate(input: $input) {
          metaobject {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        input: {
          id: id,
          fields: [
            {
              key: "scans",
              value: String(scans + 1),
            },
          ],
        },
      },
    }
  );

  const { data, errors } = await response.json();

  if (errors || data?.metaobjectUpdate?.userErrors?.length) {
    throw new Error(
      data?.metaobjectUpdate?.userErrors?.[0]?.message || "Failed to update scans"
    );
  }

  return data.metaobjectUpdate.metaobject;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateHandle(title) {
  const slug = slugify(title);
  const timestamp = Date.now().toString(36);
  return `${slug}-${timestamp}`;
}

export function validateQRCode(formData) {
  const errors = {};

  if (!formData.title) {
    errors.title = "Title is required";
  }

  if (!formData.product) {
    errors.product = "Product is required";
  }

  if (!formData.destination) {
    errors.destination = "Destination is required";
  }

  return errors;
}
