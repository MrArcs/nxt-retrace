"use client"

import { ArrowLeft } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

export function HeaderBackButton() {
  const pathname = usePathname()
  const router = useRouter()

  if (pathname === "/") return null

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        if (window.history.length > 1) {
          router.back()
        } else {
          router.push("/")
        }
      }}
    >
      <ArrowLeft />
      Back
    </Button>
  )
}
