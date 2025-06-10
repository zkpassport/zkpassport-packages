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
    <div className="container mx-auto py-8 px-4 sm:py-20">
      <div className="max-w-3xl mx-auto text-center mb-8 sm:mb-16">
        <h1 className="text-3xl sm:text-4xl font-bold mb-4">Registry Explorer</h1>
        <p className="text-lg sm:text-xl text-muted-foreground px-4">
          Explore certificates and historical roots in the registry
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 sm:h-6 sm:w-6" />
              <span>Certificates</span>
            </CardTitle>
            <CardDescription className="text-sm">
              Search and verify certificates in the registry
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-muted-foreground text-sm sm:text-base">
              View details of certificates, verify their authenticity, and check their status in the
              registry.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              asChild
              className="w-full bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 text-white py-3 px-6 rounded-lg shadow-sm transition-all duration-300 transform hover:scale-[1.01]"
            >
              <Link href="/certificates">Browse Certificates</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 sm:h-6 sm:w-6" />
              <span>Historical Certificate Roots</span>
            </CardTitle>
            <CardDescription className="text-sm">
              Browse historical certificate registry roots
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-muted-foreground text-sm sm:text-base">
              Explore historical certificate registry merkle roots, their validity periods, and
              certificate counts. Each root captures a snapshot of the registry at a specific point
              in time.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              asChild
              className="w-full bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 text-white py-3 px-6 rounded-lg shadow-sm transition-all duration-300 transform hover:scale-[1.01]"
            >
              <Link href="/certificates/history">Browse Certificate Roots</Link>
            </Button>
          </CardFooter>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 sm:h-6 sm:w-6" />
              <span>Historical Circuit Roots</span>
            </CardTitle>
            <CardDescription className="text-sm">
              Browse historical circuit registry roots
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-muted-foreground text-sm sm:text-base">
              Explore historical circuit registry merkle roots, their validity periods, and circuit
              counts. Each root captures a snapshot of the registry at a specific point in time.
            </p>
          </CardContent>
          <CardFooter>
            <Button
              asChild
              className="w-full bg-gradient-to-r from-blue-700 to-blue-800 hover:from-blue-600 hover:to-blue-700 text-white py-3 px-6 rounded-lg shadow-sm transition-all duration-300 transform hover:scale-[1.01]"
            >
              <Link href="/circuits/history">Browse Circuit Roots</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
