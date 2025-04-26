import Link from "next/link"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, History } from "lucide-react"

export default function HomePage() {
  return (
    <div className="container mx-auto py-20">
      <div className="max-w-3xl mx-auto text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">Certificate Registry Explorer</h1>
        <p className="text-xl text-muted-foreground">
          Explore certificates and historical merkle roots in the registry
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-6 w-6" />
              <span>Certificates</span>
            </CardTitle>
            <CardDescription>Search and verify certificates in the registry</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-muted-foreground">
              View details of certificates, verify their authenticity, and check their status in the
              registry.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full dark:text-white dark:bg-blue-700">
              <Link href="/certificates">Browse Certificates</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-6 w-6" />
              <span>Historical Roots</span>
            </CardTitle>
            <CardDescription>Browse historical merkle tree roots</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-muted-foreground">
              Explore historical merkle roots, their validity periods, and certificate counts. Each
              root captures a snapshot of the registry at a specific point in time.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild className="w-full dark:text-white dark:bg-blue-700">
              <Link href="/history">Browse Historical Roots</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
