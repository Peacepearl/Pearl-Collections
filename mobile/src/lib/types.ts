export type Variant = {
  id: string
  size: string | null
  colour: string | null
  stock_quantity: number
}

export type Product = {
  id: string
  name: string
  description: string
  price: number
  category: string
  gender: string
  image_url: string
  is_active: boolean
  product_variants: Variant[]
}

export type CartLine = { product: Product; variant: Variant; quantity: number }

export const formatNaira = (amount: number) => `₦${amount.toLocaleString('en-NG')}`
