Add-Type -AssemblyName System.Drawing

$assetRoot = Join-Path $PSScriptRoot '..\src\assets\characters'
$pixel = 4

function New-Layer {
  param(
    [string]$RelativePath,
    [scriptblock]$Draw
  )
  $target = Join-Path $assetRoot $RelativePath
  $directory = Split-Path -Parent $target
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  $bitmap = [System.Drawing.Bitmap]::new(64, 64)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  & $Draw $graphics
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Brush([string]$Color) {
  return [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($Color))
}

function Rect($Graphics, [string]$Color, [int]$X, [int]$Y, [int]$Width, [int]$Height) {
  $brush = Brush $Color
  $Graphics.FillRectangle($brush, $X, $Y, $Width, $Height)
  $brush.Dispose()
}

function BodyLayer($Graphics, [string]$Skin, [bool]$Feminine, [int]$Width, [int]$HeightOffset) {
  $outline = '#17131d'
  $left = 32 - [math]::Floor($Width / 2)
  Rect $Graphics $outline ($left - 2) (14 + $HeightOffset) ($Width + 4) 35
  Rect $Graphics $Skin $left (16 + $HeightOffset) $Width 31
  $waist = if ($Feminine) { 4 } else { 1 }
  Rect $Graphics $outline ($left + $waist) 45 ($Width - ($waist * 2)) 13
  Rect $Graphics $Skin ($left + $waist + 1) 45 ($Width - ($waist * 2) - 2) 11
}

New-Layer 'shadow\shadow_01.png' {
  param($g)
  Rect $g '#221d2c' 18 57 28 4
}

$bodies = @(
  @{ Path = 'bodies\human\masculine\standard.png'; Skin = '#c98f68'; Female = $false; Width = 22; Offset = 0 },
  @{ Path = 'bodies\human\feminine\standard.png'; Skin = '#c98f68'; Female = $true; Width = 19; Offset = 0 },
  @{ Path = 'bodies\elf\masculine\standard.png'; Skin = '#d7aa81'; Female = $false; Width = 19; Offset = 0 },
  @{ Path = 'bodies\elf\feminine\standard.png'; Skin = '#d7aa81'; Female = $true; Width = 17; Offset = 0 },
  @{ Path = 'bodies\dwarf\masculine\standard.png'; Skin = '#bb7d55'; Female = $false; Width = 27; Offset = 5 },
  @{ Path = 'bodies\dwarf\feminine\standard.png'; Skin = '#bb7d55'; Female = $true; Width = 24; Offset = 5 },
  @{ Path = 'bodies\orc\masculine\standard.png'; Skin = '#679449'; Female = $false; Width = 28; Offset = 0 },
  @{ Path = 'bodies\orc\feminine\standard.png'; Skin = '#679449'; Female = $true; Width = 24; Offset = 0 },
  @{ Path = 'bodies\tiefling\masculine\standard.png'; Skin = '#a94b54'; Female = $false; Width = 22; Offset = 0 },
  @{ Path = 'bodies\tiefling\feminine\standard.png'; Skin = '#a94b54'; Female = $true; Width = 19; Offset = 0 },
  @{ Path = 'bodies\draconian\masculine\standard.png'; Skin = '#4f829d'; Female = $false; Width = 27; Offset = 0 },
  @{ Path = 'bodies\draconian\feminine\standard.png'; Skin = '#4f829d'; Female = $true; Width = 23; Offset = 0 }
)
foreach ($body in $bodies) {
  $item = $body
  New-Layer $item.Path {
    param($g)
    BodyLayer $g $item.Skin $item.Female $item.Width $item.Offset
  }
}

New-Layer 'ears\human.png' { param($g); Rect $g '#c98f68' 18 23 5 7; Rect $g '#c98f68' 41 23 5 7 }
New-Layer 'ears\elf.png' { param($g); Rect $g '#d7aa81' 13 22 10 4; Rect $g '#d7aa81' 41 22 10 4 }
New-Layer 'ears\orc.png' { param($g); Rect $g '#679449' 15 22 8 6; Rect $g '#679449' 41 22 8 6; Rect $g '#eee1b2' 25 31 3 5; Rect $g '#eee1b2' 36 31 3 5 }
New-Layer 'ears\tiefling.png' { param($g); Rect $g '#332033' 20 7 5 12; Rect $g '#332033' 39 7 5 12; Rect $g '#7c303d' 48 38 5 18 }
New-Layer 'ears\draconian.png' { param($g); Rect $g '#27475c' 19 6 5 13; Rect $g '#27475c' 40 6 5 13; Rect $g '#315f79' 47 38 8 18 }

New-Layer 'eyes\round_blue.png' { param($g); Rect $g '#f4f4ef' 24 24 5 5; Rect $g '#f4f4ef' 35 24 5 5; Rect $g '#3d78b9' 26 25 2 3; Rect $g '#3d78b9' 36 25 2 3 }
New-Layer 'eyes\sharp_green.png' { param($g); Rect $g '#4d9b62' 24 25 5 2; Rect $g '#4d9b62' 35 25 5 2 }
New-Layer 'eyes\bright_gold.png' { param($g); Rect $g '#fff2a2' 24 24 5 4; Rect $g '#fff2a2' 35 24 5 4 }

New-Layer 'faces\neutral.png' { param($g); Rect $g '#8d5842' 31 29 3 2; Rect $g '#623832' 29 34 6 1 }
New-Layer 'faces\smile.png' { param($g); Rect $g '#8d5842' 31 29 3 2; Rect $g '#a44f5b' 29 33 6 2 }
New-Layer 'faces\scar.png' { param($g); Rect $g '#8f3940' 38 21 1 12; Rect $g '#8f3940' 36 25 5 1 }

$hairParts = @(
  @{ Id = 'short_01'; Back = { param($g); Rect $g '#3c251a' 20 12 24 9 }; Front = { param($g); Rect $g '#211713' 21 11 22 5; Rect $g '#3c251a' 22 16 6 5 } },
  @{ Id = 'long_01'; Back = { param($g); Rect $g '#5a3020' 18 11 28 29 }; Front = { param($g); Rect $g '#351d17' 20 10 25 7; Rect $g '#5a3020' 20 16 5 15; Rect $g '#5a3020' 40 16 5 15 } },
  @{ Id = 'curly_01'; Back = { param($g); Rect $g '#2a1b17' 17 9 30 19 }; Front = { param($g); Rect $g '#4a2d22' 19 9 26 10; Rect $g '#2a1b17' 18 15 6 9; Rect $g '#2a1b17' 41 15 6 9 } }
)
foreach ($hair in $hairParts) {
  $part = $hair
  New-Layer "hair\back\$($part.Id).png" $part.Back
  New-Layer "hair\front\$($part.Id).png" $part.Front
}

New-Layer 'beards\short_01.png' { param($g); Rect $g '#3a241b' 25 34 14 5 }
New-Layer 'beards\full_01.png' { param($g); Rect $g '#4a2b1c' 23 32 18 11; Rect $g '#2e1c18' 27 42 10 5 }
New-Layer 'beards\braided_01.png' { param($g); Rect $g '#603b22' 23 32 18 11; Rect $g '#603b22' 29 42 6 11; Rect $g '#d0a23b' 29 48 6 2 }

New-Layer 'clothes\adventurer_tunic.png' { param($g); Rect $g '#315a9c' 21 37 22 18; Rect $g '#d8a62f' 21 47 22 2 }
New-Layer 'clothes\warrior_underlay.png' { param($g); Rect $g '#6f2731' 20 36 24 19; Rect $g '#2e3138' 20 48 24 4 }
New-Layer 'clothes\cleric_robe.png' { param($g); Rect $g '#ece7d8' 20 35 24 22; Rect $g '#d8a62f' 30 35 4 22 }
New-Layer 'clothes\mage_robe.png' { param($g); Rect $g '#513071' 20 35 24 22; Rect $g '#8e70c4' 30 35 4 22 }
New-Layer 'clothes\ranger_leather.png' { param($g); Rect $g '#356044' 20 36 24 19; Rect $g '#725039' 29 34 5 22 }
New-Layer 'clothes\rogue_leather.png' { param($g); Rect $g '#282b35' 20 36 24 19; Rect $g '#6a3948' 20 45 24 3 }
New-Layer 'clothes\barbarian_fur.png' { param($g); Rect $g '#815339' 18 36 28 8; Rect $g '#473126' 21 44 22 11 }

New-Layer 'armor\iron_warrior.png' { param($g); Rect $g '#78818b' 19 34 26 14; Rect $g '#b7bec4' 23 35 18 3; Rect $g '#d5a936' 31 34 3 15 }
New-Layer 'boots\leather_01.png' { param($g); Rect $g '#493124' 20 54 10 5; Rect $g '#493124' 35 54 10 5 }
New-Layer 'helmets\cleric_hood.png' { param($g); Rect $g '#ece7d8' 18 9 28 12; Rect $g '#d8a62f' 19 17 26 3 }
New-Layer 'helmets\rogue_hood.png' { param($g); Rect $g '#22242d' 18 8 28 15; Rect $g '#16171d' 22 15 20 7 }
New-Layer 'accessories\glasses_round.png' { param($g); Rect $g '#d7b957' 23 23 8 1; Rect $g '#d7b957' 34 23 8 1; Rect $g '#d7b957' 31 25 3 1 }

New-Layer 'weapons\sword_iron.png' { param($g); Rect $g '#c8d0d7' 50 24 4 25; Rect $g '#e5e9ec' 51 20 2 7; Rect $g '#d8a62f' 47 47 10 3; Rect $g '#674128' 51 50 3 8 }
New-Layer 'weapons\staff_oak.png' { param($g); Rect $g '#704529' 51 19 3 39; Rect $g '#d8a62f' 47 16 11 5; Rect $g '#62b6ff' 50 12 5 6 }
New-Layer 'weapons\bow_short.png' { param($g); Rect $g '#86532e' 50 25 3 27; Rect $g '#d9d1b6' 55 25 1 27 }
New-Layer 'weapons\daggers_twin.png' { param($g); Rect $g '#c8d0d7' 49 38 11 3; Rect $g '#c8d0d7' 4 38 11 3 }
New-Layer 'weapons\axe_barbarian.png' { param($g); Rect $g '#68432a' 51 22 3 36; Rect $g '#9da5ad' 45 20 14 9 }
New-Layer 'shields\shield_wood.png' { param($g); Rect $g '#4a3024' 6 33 14 18; Rect $g '#a66f36' 8 35 10 13; Rect $g '#d8a62f' 12 35 3 13 }
New-Layer 'effects\magic_blue.png' { param($g); Rect $g '#7fd2ff' 55 11 3 3; Rect $g '#bceaff' 48 17 2 2 }

Write-Host "Generated placeholder layers at $assetRoot"
