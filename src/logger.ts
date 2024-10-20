// import { createLogger, transports, format } from 'winston'
// import colors from 'colors/safe'
// import util from 'util'

// const logger = createLogger({
//   level: 'debug',
//   format: format.combine(
//     format.timestamp({ format: 'HH:mm' }),
//     format.printf(({ timestamp, level, message, additionalInfo }) => {
//       const colorMap = {
//         debug: colors.cyan,
//         info: colors.green,
//         warn: colors.yellow,
//         error: colors.red,
//       } as const
//       const coloredLevel = (colorMap[level as keyof typeof colorMap] || colors.white)(level.toUpperCase())

//       let logMessage = `${timestamp} [${coloredLevel}] ${message}`

//       if (additionalInfo && additionalInfo.length > 0) {
//         logMessage += ' ' + util.inspect(additionalInfo, { depth: null, colors: true })
//       }

//       return logMessage
//     }),
//   ),
//   transports: [new transports.Console()],
// })

// const customLogger = {
//   debug: (message: string, ...args: any[]) => logger.debug(message, { additionalInfo: args }),
//   info: (message: string, ...args: any[]) => logger.info(message, { additionalInfo: args }),
//   warn: (message: string, ...args: any[]) => logger.warn(message, { additionalInfo: args }),
//   error: (message: string, ...args: any[]) => logger.error(message, { additionalInfo: args }),
// }

const customLogger = {
  debug: (message: string, ...args: any[]) => console.debug(message, ...args),
  info: (message: string, ...args: any[]) => console.info(message, ...args),
  warn: (message: string, ...args: any[]) => console.warn(message, ...args),
  error: (message: string, ...args: any[]) => console.error(message, ...args),
}

export default customLogger
