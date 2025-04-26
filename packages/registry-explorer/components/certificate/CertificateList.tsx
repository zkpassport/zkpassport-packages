import type { PackagedCertificate } from "@zkpassport/utils"
import { getCountryName, formatTimestamp, truncate, isRSA, isECDSA } from "@/lib/certificate-utils"
import { Button } from "@/components/ui/button"

interface CertificateListProps {
  certificates: PackagedCertificate[]
  isLoading: boolean
}

export function CertificateList({ certificates, isLoading }: CertificateListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-40">
        <svg
          className="animate-spin -ml-1 mr-3 h-8 w-8 text-blue-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <span className="text-lg font-medium">Loading certificates...</span>
      </div>
    )
  }

  if (certificates.length === 0) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="mt-2 text-lg font-medium">No certificates found</h3>
        <p className="mt-1 text-gray-500 dark:text-gray-400">Try adjusting your search criteria.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {certificates.map((cert, index) => (
        <div
          key={index}
          className="group bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border border-gray-100 dark:border-gray-700"
        >
          {/* Certificate Header with gradient background */}
          <div
            className={`px-6 py-5 ${
              isRSA(cert)
                ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20"
                : "bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20"
            } border-b border-gray-100 dark:border-gray-700`}
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {getCountryName(cert.country)}
                  <span className="ml-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                    ({cert.country})
                  </span>
                </h3>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 flex items-center">
                  <span
                    className={`inline-block w-2 h-2 rounded-full mr-2 ${
                      isRSA(cert) ? "bg-blue-400" : "bg-emerald-400"
                    }`}
                  ></span>
                  {cert.signature_algorithm}
                </p>
              </div>
              <div className="text-right flex items-center">
                <div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                    {cert.public_key.key_size} bits
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Certificate Content */}
          <div className="px-6 py-5 space-y-4">
            {/* Validity Period */}
            <div className="flex flex-wrap gap-y-2">
              <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                Validity Period
              </div>
              <div className="w-full sm:w-2/3 text-sm text-gray-900 dark:text-gray-100">
                <span className="text-green-600 dark:text-green-400">
                  {formatTimestamp(cert.validity.not_before)}
                </span>{" "}
                -
                <span className="text-green-600 dark:text-green-400">
                  {" "}
                  {formatTimestamp(cert.validity.not_after)}
                </span>
              </div>
            </div>

            {/* Public Key Type */}
            <div className="flex flex-wrap gap-y-2">
              <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                Key Type
              </div>
              <div className="w-full sm:w-2/3">
                <code className="px-2 py-1 text-sm font-mono bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                  {cert.public_key.type} {cert.public_key.key_size}
                </code>
              </div>
            </div>

            {/* Hash Algorithm */}
            <div className="flex flex-wrap gap-y-2">
              <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                Hash Algorithm
              </div>
              <div className="w-full sm:w-2/3">
                <code className="px-2 py-1 text-sm font-mono bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                  {cert.hash_algorithm}
                </code>
              </div>
            </div>

            {/* RSA Specific Fields */}
            {isRSA(cert) && (
              <>
                {/* Modulus */}
                <div className="flex flex-wrap gap-y-2">
                  <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Public Key Modulus
                  </div>
                  <div className="w-full sm:w-2/3">
                    <div className="relative group">
                      <div className="relative">
                        <code className="font-mono text-xs p-2 pr-9 block bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 break-all">
                          {truncate(cert.public_key.modulus, 100)}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                          onClick={() => {
                            if ("modulus" in cert.public_key) {
                              window.navigator.clipboard.writeText(cert.public_key.modulus)
                            }
                          }}
                          aria-label="Copy full modulus"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-full w-full"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                            />
                          </svg>
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Exponent */}
                <div className="flex flex-wrap gap-y-2">
                  <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                    Public Key Exponent
                  </div>
                  <div className="w-full sm:w-2/3">
                    <code className="px-2 py-1 text-sm font-mono bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                      {cert.public_key.exponent}
                    </code>
                  </div>
                </div>
              </>
            )}

            {/* ECDSA Specific Fields */}
            {isECDSA(cert) && (
              <>
                {/* Curve */}
                {cert.public_key.curve && (
                  <div className="flex flex-wrap gap-y-2">
                    <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Curve
                    </div>
                    <div className="w-full sm:w-2/3">
                      <code className="px-2 py-1 text-sm font-mono bg-gray-100 dark:bg-gray-700 rounded text-gray-900 dark:text-gray-100">
                        {cert.public_key.curve}
                      </code>
                    </div>
                  </div>
                )}

                {/* X coordinate */}
                {cert.public_key.public_key_x && (
                  <div className="flex flex-wrap gap-y-2">
                    <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Public Key (X)
                    </div>
                    <div className="w-full sm:w-2/3">
                      <div className="relative group">
                        <div className="relative">
                          <code className="font-mono text-xs p-2 pr-9 block bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 break-all">
                            {truncate(cert.public_key.public_key_x, 100)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                            onClick={() =>
                              window.navigator.clipboard.writeText(
                                cert.public_key.public_key_x || "",
                              )
                            }
                            aria-label="Copy X coordinate"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-full w-full"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                              />
                            </svg>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Y coordinate */}
                {cert.public_key.public_key_y && (
                  <div className="flex flex-wrap gap-y-2">
                    <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                      Public Key (Y)
                    </div>
                    <div className="w-full sm:w-2/3">
                      <div className="relative group">
                        <div className="relative">
                          <code className="font-mono text-xs p-2 pr-9 block bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 break-all">
                            {truncate(cert.public_key.public_key_y, 100)}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-1 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                            onClick={() =>
                              window.navigator.clipboard.writeText(
                                cert.public_key.public_key_y || "",
                              )
                            }
                            aria-label="Copy Y coordinate"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="h-full w-full"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                              />
                            </svg>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Subject Key Identifier */}
            {cert.subject_key_identifier && (
              <div className="flex flex-wrap gap-y-2">
                <div className="w-full sm:w-1/3 text-sm font-medium text-gray-500 dark:text-gray-400">
                  Subject Key Identifier
                </div>
                <div className="w-full sm:w-2/3">
                  <code className="font-mono text-xs p-2 block bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                    {cert.subject_key_identifier}
                  </code>
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
