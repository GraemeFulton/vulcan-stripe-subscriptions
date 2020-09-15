export const Products = {};

export const addSubscriptionProduct = (vulcanProductKey, product) => {
  product.vulcanProductKey = vulcanProductKey
  Products[vulcanProductKey] = product
};
