import winston from 'winston'
import colors from 'colors/safe'
import util from 'util'

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm' }),
    winston.format.printf(({ timestamp, level, message, additionalInfo }) => {
      const colorMap = {
        debug: colors.cyan,
        info: colors.green,
        warn: colors.yellow,
        error: colors.red,
      } as const
      const coloredLevel = (colorMap[level as keyof typeof colorMap] || colors.white)(level.toUpperCase())

      let logMessage = `${timestamp} [${coloredLevel}] ${message}`

      if (additionalInfo && additionalInfo.length > 0) {
        logMessage += ' ' + util.inspect(additionalInfo, { depth: null, colors: true })
      }

      return logMessage
    }),
  ),
  transports: [new winston.transports.Console()],
})

const customLogger = {
  debug: (message: string, ...args: any[]) => logger.debug(message, { additionalInfo: args }),
  info: (message: string, ...args: any[]) => logger.info(message, { additionalInfo: args }),
  warn: (message: string, ...args: any[]) => logger.warn(message, { additionalInfo: args }),
  error: (message: string, ...args: any[]) => logger.error(message, { additionalInfo: args }),
}

export default customLogger
