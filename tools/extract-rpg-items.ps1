param(
  [string]$Source = "RPG Items\rpgItems.png",
  [string]$Destination = "src\assets\rpg\items-pack",
  [int]$TileSize = 16,
  [int]$Rows = 8,
  [int]$Columns = 8
)

Add-Type -AssemblyName System.Drawing
$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$destinationPath = Join-Path (Get-Location) $Destination
[System.IO.Directory]::CreateDirectory($destinationPath) | Out-Null
$sheet = [System.Drawing.Bitmap]::FromFile($sourcePath)
try {
  for ($row = 0; $row -lt $Rows; $row++) {
    for ($column = 0; $column -lt $Columns; $column++) {
      $tile = New-Object System.Drawing.Bitmap $TileSize, $TileSize
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($tile)
        try {
          $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
          $sourceRectangle = New-Object System.Drawing.Rectangle ($column * $TileSize), ($row * $TileSize), $TileSize, $TileSize
          $destinationRectangle = New-Object System.Drawing.Rectangle 0, 0, $TileSize, $TileSize
          $graphics.DrawImage($sheet, $destinationRectangle, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)
        } finally {
          $graphics.Dispose()
        }
        $output = Join-Path $destinationPath "item-$row-$column.png"
        $tile.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
      } finally {
        $tile.Dispose()
      }
    }
  }
} finally {
  $sheet.Dispose()
}
