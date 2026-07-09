# KingbaseES Official Nodejs Driver

This directory contains Kingbase's official Nodejs interface driver for KingbaseES.

## Source

- Download page: https://www.kingbase.com.cn/download.html
- Package: KingbaseES_V009R001C010B0004_NODEJS.zip
- Driver line: KES V9R1C10 allmode
- Direct URL: https://kingbase.oss-cn-beijing.aliyuncs.com/upload/KESV9-baseline/allmode/V009R001C010/V009R001C010B0004_interface/NODEJS/KingbaseES_V009R001C010B0004_NODEJS.zip
- Retrieved: 2026-07-09

The direct OSS URL requires the Kingbase download page referer.

```powershell
Invoke-WebRequest `
  -Uri "https://kingbase.oss-cn-beijing.aliyuncs.com/upload/KESV9-baseline/allmode/V009R001C010/V009R001C010B0004_interface/NODEJS/KingbaseES_V009R001C010B0004_NODEJS.zip" `
  -Headers @{ Referer = "https://www.kingbase.com.cn/download.html"; "User-Agent" = "Mozilla/5.0" } `
  -OutFile "$env:TEMP\airdb-kingbase-nodejs\KingbaseES_V009R001C010B0004_NODEJS.zip"
```

## Package

- Runtime entry: `node_modules/kb`
- Package name: `kb`
- Package version: `Build Version{ V009R001B0001 [d49ef542 2025-06-24 23:30:41] }`
- Runtime mode used by AirDB: pure JavaScript `require("kb").Client`

The inspected package contains no `.node`, `.dll`, `.so`, `.dylib`, or `.exe` files. The `kb/lib/native` path references `kb-native`; AirDB does not import that path.

## License Metadata

The inspected `package.json` files have empty or missing `license` fields. Confirm Kingbase redistribution permission before publishing this extension package to a public marketplace.
