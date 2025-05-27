import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FileText, History } from "lucide-react"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="container mx-auto py-20">
      <div className="max-w-3xl mx-auto text-center mb-16">
        <h1 className="text-4xl font-bold mb-4">Registry Explorer</h1>
        <p className="text-xl text-muted-foreground">
          Explore certificates and historical roots in the registry
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
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
            <Button
              asChild
              className="w-full dark:text-white dark:bg-blue-800 hover:dark:bg-blue-700"
            >
              <Link href="/certificates">Browse Certificates</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-6 w-6" />
              <span>Historical Certificate Roots</span>
            </CardTitle>
            <CardDescription>Browse historical certificate registry roots</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-muted-foreground text-base">
              Explore historical certificate registry merkle roots, their validity periods, and
              certificate counts. Each root captures a snapshot of the registry at a specific point
              in time.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              asChild
              className="w-full dark:text-white dark:bg-blue-800 hover:dark:bg-blue-700"
            >
              <Link href="/certificates/history">Browse Certificate Roots</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-6 w-6" />
              <span>Historical Circuit Roots</span>
            </CardTitle>
            <CardDescription>Browse historical circuit registry roots</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-muted-foreground">
              Explore historical circuit registry merkle roots, their validity periods, and circuit
              counts. Each root captures a snapshot of the registry at a specific point in time.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              asChild
              className="w-full dark:text-white dark:bg-blue-800 hover:dark:bg-blue-700"
            >
              <Link href="/circuits/history">Browse Circuit Roots</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
