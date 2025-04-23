import { Binary } from "../binary"
import { HashAlgorithm, PackagedCertificate, PassportViewModel, Query } from "../types"
import {
  isIDSupported,
  isCscaSupported,
  getCscaForPassport,
  processECDSASignature,
  getDSCCircuitInputs,
  getIDDataCircuitInputs,
  getDSCCountry,
  getIntegrityCheckCircuitInputs,
  getFirstNameRange,
  getLastNameRange,
  getFullNameRange,
  getDiscloseCircuitInputs,
  calculateAge,
  getAgeCircuitInputs,
  getNationalityInclusionCircuitInputs,
  getNationalityExclusionCircuitInputs,
  getIssuingCountryInclusionCircuitInputs,
  getIssuingCountryExclusionCircuitInputs,
  getBirthdateCircuitInputs,
  getExpiryDateCircuitInputs,
} from "../circuit-matcher"
import cscMasterlist from "./fixtures/csc-masterlist.json"
import { rightPadArrayWithZeros, rightPadCountryCodeArray } from "../utils"
import { getCountryWeightedSum } from "../circuits/country"
import { Alpha3Code } from "i18n-iso-countries"

const PASSPORT: PassportViewModel = {
  appVersion: "",
  mrz: "P<ZKRSILVERHAND<<JOHNNY<<<<<<<<<<<<<<<<<<<<<PA1234567_ZKR881112_M300101_<CYBERCITY<<<<\u0000\u0000",
  name: "SILVERHAND<<JOHNNY<<<<<<<<<<<<<<<<<<<<<",
  dateOfBirth: "881112",
  nationality: "ZKR",
  gender: "M",
  passportNumber: "PA1234567",
  passportExpiry: "300101",
  firstName: "",
  lastName: "",
  fullName: "SILVERHAND<<JOHNNY<<<<<<<<<<<<<<<<<<<<<",
  photo: "",
  originalPhoto: "",
  chipAuthSupported: false,
  chipAuthSuccess: false,
  chipAuthFailed: false,
  LDSVersion: "",
  dataGroups: [
    {
      groupNumber: 1,
      name: "DG1",
      hash: [
        186, 41, 255, 213, 202, 181, 165, 49, 75, 229, 246, 126, 245, 29, 98, 192, 46, 115, 41, 212,
        185, 0, 25, 70, 109, 113, 112, 76, 120, 33, 67, 62,
      ],
      value: [
        97, 91, 95, 31, 88, 80, 60, 90, 75, 82, 83, 73, 76, 86, 69, 82, 72, 65, 78, 68, 60, 60, 74,
        79, 72, 78, 78, 89, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60,
        60, 60, 60, 80, 65, 49, 50, 51, 52, 53, 54, 55, 95, 90, 75, 82, 56, 56, 49, 49, 49, 50, 95,
        77, 51, 48, 48, 49, 48, 49, 95, 60, 67, 89, 66, 69, 82, 67, 73, 84, 89, 60, 60, 60, 60, 0,
        0,
      ],
    },
    {
      groupNumber: 2,
      name: "DG2",
      hash: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0,
      ],
      value: [],
    },
  ],
  dataGroupsHashAlgorithm: "SHA256",
  sod: {
    version: 3,
    digestAlgorithms: ["SHA256"],
    encapContentInfo: {
      eContentType: "mRTDSignatureData",
      eContent: {
        bytes: Binary.fromHex(
          "0x3060020100300b0609608648016503040201304e30250201010420ba29ffd5cab5a5314be5f67ef51d62c02e7329d4b90019466d71704c7821433e302502010204200000000000000000000000000000000000000000000000000000000000000000",
        ),
        version: 0,
        hashAlgorithm: "SHA256",
        dataGroupHashValues: {
          values: {
            "1": Binary.fromHex(
              "0xba29ffd5cab5a5314be5f67ef51d62c02e7329d4b90019466d71704c7821433e",
            ),
            "2": Binary.fromHex(
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            ),
          },
        },
      },
    },
    signerInfo: {
      version: 1,
      signedAttrs: {
        bytes: Binary.fromHex(
          "0x3166301506092a864886f70d01090331080606678108010101301c06092a864886f70d010905310f170d3234303530313030303030305a302f06092a864886f70d010904312204207617c588d0d85ea7dc4c1fe6465813ef35ebcda0f3a604b863f63a2b5fa7ab9d",
        ),
        contentType: "mRTDSignatureData",
        messageDigest: Binary.fromHex(
          "0x04207617c588d0d85ea7dc4c1fe6465813ef35ebcda0f3a604b863f63a2b5fa7ab9d",
        ),
        signingTime: new Date("2024-05-01T00:00:00.000Z"),
      },
      digestAlgorithm: "SHA256",
      signatureAlgorithm: { name: "sha512WithRSAEncryption" },
      signature: Binary.fromHex(
        "0x45e59bef29164ef72bc828c904f4bd49aca128c7cedb09badcc9cfd33badd79fa105443ef062b1dbda7618bade55e3ae672b46af6f50f009de8074b2c105269058239a37285aaac06bf671dc9c126d0f6c12995fb791e3dd001c6337b66bdd8b9cecb44bac2de2bb2f5fd69daecad6d026174735efa54eb5c98416689b004318cb39e165d3f8e1ded08d57d9310ec8b46dc54d3ad9f1043f0df137e43cce1d0c5ec8a07eef619fcb9503afbbebff96cc1ecab9d262982359465713e47798e24bbea2301295bd7005628f0328500f3418f09cb282c19d0cefb84eed764b23f248e2a9ac5b06f21dd31b37208a1a5d90daec46a7cf674ec6c4f18cc16c82b35765",
      ),
      sid: {
        subjectKeyIdentifier: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    },
    certificate: {
      tbs: {
        bytes: Binary.fromHex(
          "0x3082022aa003020102020102300d06092a864886f70d01010d050030313121301f060355040313185a4b70617373706f7274205465737420526f6f7420435343310c300a060355040613035a4b52301e170d3235303432333039313032355a170d3237303432333039313032355a301e311c301a060355040313135a4b70617373706f727420546573742044534330820122300d06092a864886f70d01010105000382010f003082010a02820101008da8d556dc0251fe1590fd5816be8d09eb7d379c0b128e5e4a7822d8e513eb4662a5e04aefafecc9a792fba8e32320dd63d0fed7830e1e643aa0bc05b86802d1373f525db23c9f71b111b3731ac4f633321aa0ae81ad7cc25f797b1e0ed2aed4d02c1573fced88d8a22f04466baa174f11e9c75db59ee790297b3e593f5ab178bfdcce1a68b0d8b92c6ac10c59dde9551b77b8a7af21d8b75248531a55ca46f481983c6654ae0f0bfdb9a19042c517fadb485ebafb7f7c7c3dbe45ab62d6bb88b373129832ac60eec78ef6ff8824e696d818948b1dd03b661d7e2e66b6a5760652f56cfeca36dae856ed7e3d068727d0a97b5479cc8d4c27b70adc8b541d417f0203010001a3783076300c0603551d130101ff04023000300e0603551d0f0101ff04040302000130290603551d0e042204209beccdeb27cd08aaffb7a68e5f2b09650e3b89400cda287bf6195666cc05e6ec302b0603551d23042430228020f13dbc6c7c2b8362a0bc01ecaf05758b88670a753a214a0dfb83d65a140bf234",
        ),
        version: 2,
        serialNumber: Binary.fromHex("0x02"),
        signatureAlgorithm: { name: "sha512WithRSAEncryption" },
        issuer: "commonName=ZKpassport Test Root CSC, countryName=ZKR",
        validity: {
          notBefore: new Date("2025-04-23T09:10:25.000Z"),
          notAfter: new Date("2027-04-23T09:10:25.000Z"),
        },
        subject: "commonName=ZKpassport Test DSC",
        subjectPublicKeyInfo: {
          signatureAlgorithm: { name: "rsaEncryption" },
          subjectPublicKey: Binary.fromHex(
            "0x3082010a02820101008da8d556dc0251fe1590fd5816be8d09eb7d379c0b128e5e4a7822d8e513eb4662a5e04aefafecc9a792fba8e32320dd63d0fed7830e1e643aa0bc05b86802d1373f525db23c9f71b111b3731ac4f633321aa0ae81ad7cc25f797b1e0ed2aed4d02c1573fced88d8a22f04466baa174f11e9c75db59ee790297b3e593f5ab178bfdcce1a68b0d8b92c6ac10c59dde9551b77b8a7af21d8b75248531a55ca46f481983c6654ae0f0bfdb9a19042c517fadb485ebafb7f7c7c3dbe45ab62d6bb88b373129832ac60eec78ef6ff8824e696d818948b1dd03b661d7e2e66b6a5760652f56cfeca36dae856ed7e3d068727d0a97b5479cc8d4c27b70adc8b541d417f0203010001",
          ),
        },
        extensions: new Map(),
      },
      signatureAlgorithm: { name: "sha512WithRSAEncryption" },
      signature: Binary.fromHex(
        "0x2e1e79e483fac5aee248be8fa0fa50d73d42eba1bcb0fce3d787963255247055cbb0bcee9da9c8d7766c07b8ccc4316496d3758ceb769c490c8d4eee7bd7c9be797f1e381fc15c0882b754db2878d8413fc32eb717c4124363a712184a08c5c996202bbc755dee0b159b19362e0d00eff7c8580c9b7977970c21c24b5362ca9a4c9b207f5c1bebe7210d2315be708c29abd438b0c15cf16a0cc3c218e2c5b4abcb2aa9b04b939d2ad953d61cc3208b62a386bf7443ee90688b33d0a9c317863b655e195c43220040233e4292f4ac3d138c21a513bcc4ade56555ad783d2957a786174a20ac3d310c2b7fc8aa8f4f90cbb95d9cc431345e1396bff94f880a7458dda05fbe7f8367b163bd1d7e90a4aad72f14e05afb5d58b91d2c3208715818d921a0ffad92c0178415b35a8ce02ab6d1774e0969eb240345edc76e321a5177447cf842d19933b67d2b00960bce7f2d71b3131a468bd3b616427db6f27f4a31d1d5f8c368ed692f971640261bfba8218d176baa60aa82de97ae23ade887cda7ee1ce7130658394b5a66b874f6e4595ec4f266b985e7611c28c867b2df7804f748bfc953e2fca1b177b0d4160f7b9d59855cc59a23dcc18e9747ea5c6fb34951685e89b54ff9e47e1f1f5aa9980cfcf524293dbeaea7914353aba5fa043a497654ccb5ff9412d4cc4a33cb3ecadae39c4f8dab13a51cea1f74ac35046dc4f2db00",
      ),
    },
    bytes: Binary.fromHex(
      "0x3082069206092a864886f70d010702a08206833082067f020103310d300b0609608648016503040201306e0606678108010101a06404623060020100300b0609608648016503040201304e30250201010420ba29ffd5cab5a5314be5f67ef51d62c02e7329d4b90019466d71704c7821433e302502010204200000000000000000000000000000000000000000000000000000000000000000a0820446308204423082022aa003020102020102300d06092a864886f70d01010d050030313121301f060355040313185a4b70617373706f7274205465737420526f6f7420435343310c300a060355040613035a4b52301e170d3235303432333039313032355a170d3237303432333039313032355a301e311c301a060355040313135a4b70617373706f727420546573742044534330820122300d06092a864886f70d01010105000382010f003082010a02820101008da8d556dc0251fe1590fd5816be8d09eb7d379c0b128e5e4a7822d8e513eb4662a5e04aefafecc9a792fba8e32320dd63d0fed7830e1e643aa0bc05b86802d1373f525db23c9f71b111b3731ac4f633321aa0ae81ad7cc25f797b1e0ed2aed4d02c1573fced88d8a22f04466baa174f11e9c75db59ee790297b3e593f5ab178bfdcce1a68b0d8b92c6ac10c59dde9551b77b8a7af21d8b75248531a55ca46f481983c6654ae0f0bfdb9a19042c517fadb485ebafb7f7c7c3dbe45ab62d6bb88b373129832ac60eec78ef6ff8824e696d818948b1dd03b661d7e2e66b6a5760652f56cfeca36dae856ed7e3d068727d0a97b5479cc8d4c27b70adc8b541d417f0203010001a3783076300c0603551d130101ff04023000300e0603551d0f0101ff04040302000130290603551d0e042204209beccdeb27cd08aaffb7a68e5f2b09650e3b89400cda287bf6195666cc05e6ec302b0603551d23042430228020f13dbc6c7c2b8362a0bc01ecaf05758b88670a753a214a0dfb83d65a140bf234300d06092a864886f70d01010d050003820201002e1e79e483fac5aee248be8fa0fa50d73d42eba1bcb0fce3d787963255247055cbb0bcee9da9c8d7766c07b8ccc4316496d3758ceb769c490c8d4eee7bd7c9be797f1e381fc15c0882b754db2878d8413fc32eb717c4124363a712184a08c5c996202bbc755dee0b159b19362e0d00eff7c8580c9b7977970c21c24b5362ca9a4c9b207f5c1bebe7210d2315be708c29abd438b0c15cf16a0cc3c218e2c5b4abcb2aa9b04b939d2ad953d61cc3208b62a386bf7443ee90688b33d0a9c317863b655e195c43220040233e4292f4ac3d138c21a513bcc4ade56555ad783d2957a786174a20ac3d310c2b7fc8aa8f4f90cbb95d9cc431345e1396bff94f880a7458dda05fbe7f8367b163bd1d7e90a4aad72f14e05afb5d58b91d2c3208715818d921a0ffad92c0178415b35a8ce02ab6d1774e0969eb240345edc76e321a5177447cf842d19933b67d2b00960bce7f2d71b3131a468bd3b616427db6f27f4a31d1d5f8c368ed692f971640261bfba8218d176baa60aa82de97ae23ade887cda7ee1ce7130658394b5a66b874f6e4595ec4f266b985e7611c28c867b2df7804f748bfc953e2fca1b177b0d4160f7b9d59855cc59a23dcc18e9747ea5c6fb34951685e89b54ff9e47e1f1f5aa9980cfcf524293dbeaea7914353aba5fa043a497654ccb5ff9412d4cc4a33cb3ecadae39c4f8dab13a51cea1f74ac35046dc4f2db00318201af308201ab02010180200000000000000000000000000000000000000000000000000000000000000000300b0609608648016503040201a066301506092a864886f70d01090331080606678108010101301c06092a864886f70d010905310f170d3234303530313030303030305a302f06092a864886f70d010904312204207617c588d0d85ea7dc4c1fe6465813ef35ebcda0f3a604b863f63a2b5fa7ab9d300b06092a864886f70d01010d0482010045e59bef29164ef72bc828c904f4bd49aca128c7cedb09badcc9cfd33badd79fa105443ef062b1dbda7618bade55e3ae672b46af6f50f009de8074b2c105269058239a37285aaac06bf671dc9c126d0f6c12995fb791e3dd001c6337b66bdd8b9cecb44bac2de2bb2f5fd69daecad6d026174735efa54eb5c98416689b004318cb39e165d3f8e1ded08d57d9310ec8b46dc54d3ad9f1043f0df137e43cce1d0c5ec8a07eef619fcb9503afbbebff96cc1ecab9d262982359465713e47798e24bbea2301295bd7005628f0328500f3418f09cb282c19d0cefb84eed764b23f248e2a9ac5b06f21dd31b37208a1a5d90daec46a7cf674ec6c4f18cc16c82b35765",
    ),
  },
  sodVersion: "3",
  signedAttributes: [
    49, 102, 48, 21, 6, 9, 42, 134, 72, 134, 247, 13, 1, 9, 3, 49, 8, 6, 6, 103, 129, 8, 1, 1, 1,
    48, 28, 6, 9, 42, 134, 72, 134, 247, 13, 1, 9, 5, 49, 15, 23, 13, 50, 52, 48, 53, 48, 49, 48,
    48, 48, 48, 48, 48, 90, 48, 47, 6, 9, 42, 134, 72, 134, 247, 13, 1, 9, 4, 49, 34, 4, 32, 118,
    23, 197, 136, 208, 216, 94, 167, 220, 76, 31, 230, 70, 88, 19, 239, 53, 235, 205, 160, 243, 166,
    4, 184, 99, 246, 58, 43, 95, 167, 171, 157,
  ],
  signedAttributesHashAlgorithm: "SHA256",
  eContent: [
    48, 96, 2, 1, 0, 48, 11, 6, 9, 96, 134, 72, 1, 101, 3, 4, 2, 1, 48, 78, 48, 37, 2, 1, 1, 4, 32,
    186, 41, 255, 213, 202, 181, 165, 49, 75, 229, 246, 126, 245, 29, 98, 192, 46, 115, 41, 212,
    185, 0, 25, 70, 109, 113, 112, 76, 120, 33, 67, 62, 48, 37, 2, 1, 2, 4, 32, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  eContentHash: "0x04207617c588d0d85ea7dc4c1fe6465813ef35ebcda0f3a604b863f63a2b5fa7ab9d",
  eContentHashAlgorithm: "SHA256",
  tbsCertificate: [
    48, 130, 2, 42, 160, 3, 2, 1, 2, 2, 1, 2, 48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 13, 5,
    0, 48, 49, 49, 33, 48, 31, 6, 3, 85, 4, 3, 19, 24, 90, 75, 112, 97, 115, 115, 112, 111, 114,
    116, 32, 84, 101, 115, 116, 32, 82, 111, 111, 116, 32, 67, 83, 67, 49, 12, 48, 10, 6, 3, 85, 4,
    6, 19, 3, 90, 75, 82, 48, 30, 23, 13, 50, 53, 48, 52, 50, 51, 48, 57, 49, 48, 50, 53, 90, 23,
    13, 50, 55, 48, 52, 50, 51, 48, 57, 49, 48, 50, 53, 90, 48, 30, 49, 28, 48, 26, 6, 3, 85, 4, 3,
    19, 19, 90, 75, 112, 97, 115, 115, 112, 111, 114, 116, 32, 84, 101, 115, 116, 32, 68, 83, 67,
    48, 130, 1, 34, 48, 13, 6, 9, 42, 134, 72, 134, 247, 13, 1, 1, 1, 5, 0, 3, 130, 1, 15, 0, 48,
    130, 1, 10, 2, 130, 1, 1, 0, 141, 168, 213, 86, 220, 2, 81, 254, 21, 144, 253, 88, 22, 190, 141,
    9, 235, 125, 55, 156, 11, 18, 142, 94, 74, 120, 34, 216, 229, 19, 235, 70, 98, 165, 224, 74,
    239, 175, 236, 201, 167, 146, 251, 168, 227, 35, 32, 221, 99, 208, 254, 215, 131, 14, 30, 100,
    58, 160, 188, 5, 184, 104, 2, 209, 55, 63, 82, 93, 178, 60, 159, 113, 177, 17, 179, 115, 26,
    196, 246, 51, 50, 26, 160, 174, 129, 173, 124, 194, 95, 121, 123, 30, 14, 210, 174, 212, 208,
    44, 21, 115, 252, 237, 136, 216, 162, 47, 4, 70, 107, 170, 23, 79, 17, 233, 199, 93, 181, 158,
    231, 144, 41, 123, 62, 89, 63, 90, 177, 120, 191, 220, 206, 26, 104, 176, 216, 185, 44, 106,
    193, 12, 89, 221, 233, 85, 27, 119, 184, 167, 175, 33, 216, 183, 82, 72, 83, 26, 85, 202, 70,
    244, 129, 152, 60, 102, 84, 174, 15, 11, 253, 185, 161, 144, 66, 197, 23, 250, 219, 72, 94, 186,
    251, 127, 124, 124, 61, 190, 69, 171, 98, 214, 187, 136, 179, 115, 18, 152, 50, 172, 96, 238,
    199, 142, 246, 255, 136, 36, 230, 150, 216, 24, 148, 139, 29, 208, 59, 102, 29, 126, 46, 102,
    182, 165, 118, 6, 82, 245, 108, 254, 202, 54, 218, 232, 86, 237, 126, 61, 6, 135, 39, 208, 169,
    123, 84, 121, 204, 141, 76, 39, 183, 10, 220, 139, 84, 29, 65, 127, 2, 3, 1, 0, 1, 163, 120, 48,
    118, 48, 12, 6, 3, 85, 29, 19, 1, 1, 255, 4, 2, 48, 0, 48, 14, 6, 3, 85, 29, 15, 1, 1, 255, 4,
    4, 3, 2, 0, 1, 48, 41, 6, 3, 85, 29, 14, 4, 34, 4, 32, 155, 236, 205, 235, 39, 205, 8, 170, 255,
    183, 166, 142, 95, 43, 9, 101, 14, 59, 137, 64, 12, 218, 40, 123, 246, 25, 86, 102, 204, 5, 230,
    236, 48, 43, 6, 3, 85, 29, 35, 4, 36, 48, 34, 128, 32, 241, 61, 188, 108, 124, 43, 131, 98, 160,
    188, 1, 236, 175, 5, 117, 139, 136, 103, 10, 117, 58, 33, 74, 13, 251, 131, 214, 90, 20, 11,
    242, 52,
  ],
  dscSignatureAlgorithm: "sha512WithRSAEncryption",
  dscSignature: [
    46, 30, 121, 228, 131, 250, 197, 174, 226, 72, 190, 143, 160, 250, 80, 215, 61, 66, 235, 161,
    188, 176, 252, 227, 215, 135, 150, 50, 85, 36, 112, 85, 203, 176, 188, 238, 157, 169, 200, 215,
    118, 108, 7, 184, 204, 196, 49, 100, 150, 211, 117, 140, 235, 118, 156, 73, 12, 141, 78, 238,
    123, 215, 201, 190, 121, 127, 30, 56, 31, 193, 92, 8, 130, 183, 84, 219, 40, 120, 216, 65, 63,
    195, 46, 183, 23, 196, 18, 67, 99, 167, 18, 24, 74, 8, 197, 201, 150, 32, 43, 188, 117, 93, 238,
    11, 21, 155, 25, 54, 46, 13, 0, 239, 247, 200, 88, 12, 155, 121, 119, 151, 12, 33, 194, 75, 83,
    98, 202, 154, 76, 155, 32, 127, 92, 27, 235, 231, 33, 13, 35, 21, 190, 112, 140, 41, 171, 212,
    56, 176, 193, 92, 241, 106, 12, 195, 194, 24, 226, 197, 180, 171, 203, 42, 169, 176, 75, 147,
    157, 42, 217, 83, 214, 28, 195, 32, 139, 98, 163, 134, 191, 116, 67, 238, 144, 104, 139, 51,
    208, 169, 195, 23, 134, 59, 101, 94, 25, 92, 67, 34, 0, 64, 35, 62, 66, 146, 244, 172, 61, 19,
    140, 33, 165, 19, 188, 196, 173, 229, 101, 85, 173, 120, 61, 41, 87, 167, 134, 23, 74, 32, 172,
    61, 49, 12, 43, 127, 200, 170, 143, 79, 144, 203, 185, 93, 156, 196, 49, 52, 94, 19, 150, 191,
    249, 79, 136, 10, 116, 88, 221, 160, 95, 190, 127, 131, 103, 177, 99, 189, 29, 126, 144, 164,
    170, 215, 47, 20, 224, 90, 251, 93, 88, 185, 29, 44, 50, 8, 113, 88, 24, 217, 33, 160, 255, 173,
    146, 192, 23, 132, 21, 179, 90, 140, 224, 42, 182, 209, 119, 78, 9, 105, 235, 36, 3, 69, 237,
    199, 110, 50, 26, 81, 119, 68, 124, 248, 66, 209, 153, 51, 182, 125, 43, 0, 150, 11, 206, 127,
    45, 113, 179, 19, 26, 70, 139, 211, 182, 22, 66, 125, 182, 242, 127, 74, 49, 209, 213, 248, 195,
    104, 237, 105, 47, 151, 22, 64, 38, 27, 251, 168, 33, 141, 23, 107, 170, 96, 170, 130, 222, 151,
    174, 35, 173, 232, 135, 205, 167, 238, 28, 231, 19, 6, 88, 57, 75, 90, 102, 184, 116, 246, 228,
    89, 94, 196, 242, 102, 185, 133, 231, 97, 28, 40, 200, 103, 178, 223, 120, 4, 247, 72, 191, 201,
    83, 226, 252, 161, 177, 119, 176, 212, 22, 15, 123, 157, 89, 133, 92, 197, 154, 35, 220, 193,
    142, 151, 71, 234, 92, 111, 179, 73, 81, 104, 94, 137, 181, 79, 249, 228, 126, 31, 31, 90, 169,
    152, 12, 252, 245, 36, 41, 61, 190, 174, 167, 145, 67, 83, 171, 165, 250, 4, 58, 73, 118, 84,
    204, 181, 255, 148, 18, 212, 204, 74, 51, 203, 62, 202, 218, 227, 156, 79, 141, 171, 19, 165,
    28, 234, 31, 116, 172, 53, 4, 109, 196, 242, 219, 0,
  ],
  sodSignature: [
    69, 229, 155, 239, 41, 22, 78, 247, 43, 200, 40, 201, 4, 244, 189, 73, 172, 161, 40, 199, 206,
    219, 9, 186, 220, 201, 207, 211, 59, 173, 215, 159, 161, 5, 68, 62, 240, 98, 177, 219, 218, 118,
    24, 186, 222, 85, 227, 174, 103, 43, 70, 175, 111, 80, 240, 9, 222, 128, 116, 178, 193, 5, 38,
    144, 88, 35, 154, 55, 40, 90, 170, 192, 107, 246, 113, 220, 156, 18, 109, 15, 108, 18, 153, 95,
    183, 145, 227, 221, 0, 28, 99, 55, 182, 107, 221, 139, 156, 236, 180, 75, 172, 45, 226, 187, 47,
    95, 214, 157, 174, 202, 214, 208, 38, 23, 71, 53, 239, 165, 78, 181, 201, 132, 22, 104, 155, 0,
    67, 24, 203, 57, 225, 101, 211, 248, 225, 222, 208, 141, 87, 217, 49, 14, 200, 180, 109, 197,
    77, 58, 217, 241, 4, 63, 13, 241, 55, 228, 60, 206, 29, 12, 94, 200, 160, 126, 239, 97, 159,
    203, 149, 3, 175, 187, 235, 255, 150, 204, 30, 202, 185, 210, 98, 152, 35, 89, 70, 87, 19, 228,
    119, 152, 226, 75, 190, 162, 48, 18, 149, 189, 112, 5, 98, 143, 3, 40, 80, 15, 52, 24, 240, 156,
    178, 130, 193, 157, 12, 239, 184, 78, 237, 118, 75, 35, 242, 72, 226, 169, 172, 91, 6, 242, 29,
    211, 27, 55, 32, 138, 26, 93, 144, 218, 236, 70, 167, 207, 103, 78, 198, 196, 241, 140, 193,
    108, 130, 179, 87, 101,
  ],
  sodSignatureAlgorithm: "sha512WithRSAEncryption",
}

describe("Circuit Matcher", () => {
  it("should detected if ID is supported", () => {
    const result = isIDSupported(PASSPORT)
    expect(result).toBe(true)
  })

  it("should detect if CSCA certificate is supported", () => {
    const certificates = cscMasterlist.certificates
    let totalUnsupported = 0
    for (const certificate of certificates) {
      const result = isCscaSupported(certificate as PackagedCertificate)
      const isUnsupportedHashAlgorithm =
        (certificate.hash_algorithm as HashAlgorithm) === "SHA-1" ||
        (certificate.hash_algorithm as HashAlgorithm) === "SHA-224"
      const isUnsupportedExponent =
        certificate.public_key.type === "RSA" &&
        certificate.public_key.exponent !== 65537 &&
        certificate.public_key.exponent !== 3
      const isUnsupportedKeySize =
        certificate.public_key.type === "RSA" &&
        certificate.public_key.key_size !== 1024 &&
        certificate.public_key.key_size !== 2048 &&
        certificate.public_key.key_size !== 3072 &&
        certificate.public_key.key_size !== 4096
      const isUnsupported =
        isUnsupportedHashAlgorithm || isUnsupportedExponent || isUnsupportedKeySize
      if (isUnsupported) {
        totalUnsupported++
      }
      expect(isUnsupported).toBe(!result)
    }
    console.log(`Total unsupported CSCs: ${totalUnsupported} out of ${certificates.length}`)
  })

  it("should get the correct CSCA for the passport", () => {
    const result = getCscaForPassport(PASSPORT, cscMasterlist.certificates as PackagedCertificate[])
    // For now cannot find it since it's not in the masterlist
    // TODO: Add the ZKR certificate to the masterlist
    expect(result).toBe(null)
  })

  it("should get the correct DSC circuit inputs", async () => {
    const result = await getDSCCircuitInputs(
      PASSPORT,
      1n,
      cscMasterlist.certificates as PackagedCertificate[],
    )
    // TODO: Add the ZKR certificate to the masterlist to make this test pass
    expect(result).toBe(null)
  })

  it("should get the correct ID circuit inputs", async () => {
    const result = await getIDDataCircuitInputs(PASSPORT, 1n, 1n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      signed_attributes: rightPadArrayWithZeros(PASSPORT.signedAttributes, 200),
      signed_attributes_size: 104,
      comm_in: "0x21b3541593131c1cb0530f7d0c47fbe68ba340be6b08f9feba5b3481221802e5",
      salt_in: "0x1",
      salt_out: "0x1",
      dsc_pubkey: [
        141, 168, 213, 86, 220, 2, 81, 254, 21, 144, 253, 88, 22, 190, 141, 9, 235, 125, 55, 156,
        11, 18, 142, 94, 74, 120, 34, 216, 229, 19, 235, 70, 98, 165, 224, 74, 239, 175, 236, 201,
        167, 146, 251, 168, 227, 35, 32, 221, 99, 208, 254, 215, 131, 14, 30, 100, 58, 160, 188, 5,
        184, 104, 2, 209, 55, 63, 82, 93, 178, 60, 159, 113, 177, 17, 179, 115, 26, 196, 246, 51,
        50, 26, 160, 174, 129, 173, 124, 194, 95, 121, 123, 30, 14, 210, 174, 212, 208, 44, 21, 115,
        252, 237, 136, 216, 162, 47, 4, 70, 107, 170, 23, 79, 17, 233, 199, 93, 181, 158, 231, 144,
        41, 123, 62, 89, 63, 90, 177, 120, 191, 220, 206, 26, 104, 176, 216, 185, 44, 106, 193, 12,
        89, 221, 233, 85, 27, 119, 184, 167, 175, 33, 216, 183, 82, 72, 83, 26, 85, 202, 70, 244,
        129, 152, 60, 102, 84, 174, 15, 11, 253, 185, 161, 144, 66, 197, 23, 250, 219, 72, 94, 186,
        251, 127, 124, 124, 61, 190, 69, 171, 98, 214, 187, 136, 179, 115, 18, 152, 50, 172, 96,
        238, 199, 142, 246, 255, 136, 36, 230, 150, 216, 24, 148, 139, 29, 208, 59, 102, 29, 126,
        46, 102, 182, 165, 118, 6, 82, 245, 108, 254, 202, 54, 218, 232, 86, 237, 126, 61, 6, 135,
        39, 208, 169, 123, 84, 121, 204, 141, 76, 39, 183, 10, 220, 139, 84, 29, 65, 127,
      ],
      exponent: 65537,
      sod_signature: PASSPORT.sodSignature,
      dsc_pubkey_redc_param: [
        28, 234, 22, 77, 174, 65, 133, 189, 178, 35, 47, 143, 3, 65, 129, 73, 220, 70, 71, 141, 39,
        238, 224, 161, 52, 174, 19, 153, 160, 1, 20, 117, 117, 45, 20, 17, 11, 177, 245, 179, 63,
        81, 16, 249, 231, 44, 75, 241, 166, 190, 52, 101, 21, 193, 108, 186, 64, 81, 65, 89, 210,
        171, 229, 190, 156, 182, 108, 56, 12, 216, 133, 243, 29, 130, 10, 250, 163, 223, 7, 25, 38,
        236, 223, 64, 135, 210, 253, 206, 250, 44, 234, 191, 132, 95, 232, 3, 167, 212, 17, 94, 165,
        173, 70, 72, 20, 125, 103, 92, 108, 102, 84, 241, 17, 226, 23, 192, 224, 67, 75, 111, 54,
        24, 223, 158, 208, 194, 5, 105, 116, 154, 46, 200, 94, 116, 47, 196, 78, 252, 107, 138, 123,
        116, 77, 177, 167, 159, 117, 146, 157, 115, 134, 19, 113, 225, 227, 76, 30, 4, 130, 94, 232,
        151, 231, 164, 204, 203, 216, 233, 183, 143, 94, 254, 77, 227, 255, 93, 119, 23, 46, 220,
        157, 211, 58, 95, 25, 141, 151, 155, 254, 146, 112, 146, 144, 1, 23, 98, 211, 127, 250, 22,
        61, 155, 232, 40, 44, 223, 188, 123, 12, 88, 45, 206, 182, 100, 151, 195, 41, 101, 229, 25,
        62, 209, 138, 133, 32, 30, 65, 175, 123, 214, 143, 92, 7, 65, 50, 199, 133, 83, 170, 120,
        238, 103, 166, 42, 194, 126, 184, 204, 127, 116, 118, 101, 14, 11, 90, 180, 54,
      ],
      tbs_certificate: rightPadArrayWithZeros(PASSPORT.tbsCertificate, 700),
      pubkey_offset_in_tbs: 175,
    })
  })

  it("should get the right country code from DSC", () => {
    const result = getDSCCountry(PASSPORT)
    expect(result).toBe("ZKR")
  })

  it("should get the right integrity check circuit inputs", async () => {
    const result = await getIntegrityCheckCircuitInputs(PASSPORT, 1n, 1n)
    expect(result).toEqual({
      current_date: "20250423",
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      signed_attributes: rightPadArrayWithZeros(PASSPORT.signedAttributes, 200),
      signed_attributes_size: 104,
      e_content: rightPadArrayWithZeros(PASSPORT.eContent, 700),
      e_content_size: 98,
      dg1_offset_in_e_content: 27,
      comm_in: "0x017f8c4025e6b5d2d2ba24f7b858552d257c35d289dfe71da453b40039f2ce78",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      salt_in: "0x1",
      salt_out: "0x1",
    })
  })

  it("should get the correct first name range", () => {
    const result = getFirstNameRange(PASSPORT)
    expect(result).toEqual([15, 23])
  })

  it("should get the correct last name range", () => {
    const result = getLastNameRange(PASSPORT)
    // There's overlap with the first name range as the angle brackets are included
    expect(result).toEqual([5, 17])
  })

  it("should get the correct full name range", () => {
    const result = getFullNameRange(PASSPORT)
    expect(result).toEqual([5, 44])
  })

  it("should get the correct disclose circuit inputs", async () => {
    const query: Query = {
      firstname: { disclose: true },
      lastname: { disclose: true },
      birthdate: { disclose: true },
      nationality: { disclose: true },
      issuing_country: { disclose: true },
    }

    const result = await getDiscloseCircuitInputs(PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      disclose_mask: [
        0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should calculate the correct age from passport", () => {
    const result = calculateAge(PASSPORT)
    expect(result).toBe(36)
  })

  it("should get the correct age circuit inputs", async () => {
    const query: Query = {
      age: { gte: 18 },
    }
    const result = await getAgeCircuitInputs(PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_age_required: 18,
      max_age_required: 0,
    })
  })

  it("should get the correct nationality inclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getNationalityInclusionCircuitInputs(PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct nationality exclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getNationalityExclusionCircuitInputs(PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      // Notice how the country code are sorted compared to above
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct issuing country inclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getIssuingCountryInclusionCircuitInputs(PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct issuing country exclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getIssuingCountryExclusionCircuitInputs(PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct birthdate circuit inputs", async () => {
    const query: Query = {
      birthdate: { gte: new Date("1980-01-01"), lte: new Date("1990-01-01") },
    }
    const result = await getBirthdateCircuitInputs(PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_date: "19800101",
      max_date: "19900101",
    })
  })

  it("should get the correct expiry date circuit inputs", async () => {
    const query: Query = {
      expiry_date: { gte: new Date("2025-01-01"), lte: new Date("2035-12-31") },
    }
    const result = await getExpiryDateCircuitInputs(PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_date: "20250101",
      max_date: "20351231",
    })
  })
})
