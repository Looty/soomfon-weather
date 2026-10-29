param(
  [Parameter(Mandatory=$true)][string]$Kind,   # clear partly cloudy fog drizzle rain snow thunder
  [int]$Night = 0,
  [Parameter(Mandatory=$true)][string]$Temp,   # big text, e.g. "23°C" or "15°/9°"
  [string]$City = '',                          # headline, e.g. the city, "Hi / Lo", "15:00", "Fri"
  [int]$Frames = 12,
  [string]$Bg = 'black',                       # black white navy slate forest scene daynight
  [string]$SkyTop = '#2a7bd8',                 # daynight only: gradient colors computed from local time
  [string]$SkyBottom = '#8fcfff',
  [int]$Rain = -1,                             # chance of rain 0..100; -1 hides the rain subtitle
  [int]$Dot = 0,                               # page indicator: this slide's index ...
  [int]$Dots = 1                               # ... of this many slides (no dots for 1)
)
# Prints one base64 PNG per line: a seamless looping animation of $Frames frames.
# The scene drawing mirrors layouts.html (the layout preview artifact); keep them in sync.
Add-Type -AssemblyName System.Drawing
$S = 144
$TAU = [Math]::PI * 2
$D2D = 'System.Drawing.Drawing2D'

function Col([int]$a, [int]$r, [int]$g, [int]$b) { [System.Drawing.Color]::FromArgb($a, $r, $g, $b) }
function Hx([string]$hex, [int]$a = 255) { $c = [System.Drawing.ColorTranslator]::FromHtml($hex); [System.Drawing.Color]::FromArgb($a, $c.R, $c.G, $c.B) }
function Brush($c) { New-Object System.Drawing.SolidBrush $c }
function Pt([double]$x, [double]$y) { New-Object System.Drawing.PointF ([single]$x), ([single]$y) }
# Deterministic pseudo-random in [0,1) so particles are identical every frame.
function Rnd([int]$i, [int]$k) { $v = [Math]::Sin($i * 12.9898 + $k * 78.233) * 43758.5453; $v - [Math]::Floor($v) }
function A([double]$v) { [int][Math]::Max(0, [Math]::Min(255, $v * 255)) }

# Sky gradient per scene (used only by the "scene" background): top color, bottom color.
$sky = @{
  clear   = @((Col 255 40 130 235), (Col 255 135 205 255))
  partly  = @((Col 255 55 125 215), (Col 255 140 195 240))
  cloudy  = @((Col 255 95 105 120), (Col 255 160 170 182))
  fog     = @((Col 255 120 128 138), (Col 255 175 180 186))
  drizzle = @((Col 255 70 85 108), (Col 255 125 140 160))
  rain    = @((Col 255 40 52 78), (Col 255 85 100 128))
  snow    = @((Col 255 80 100 135), (Col 255 170 190 215))
  thunder = @((Col 255 28 22 52), (Col 255 70 60 100))
}
$nightSky = @((Col 255 8 14 40), (Col 255 35 48 95))
$solid = @{
  black  = (Col 255 0 0 0)
  white  = (Col 255 255 255 255)
  navy   = (Col 255 11 26 58)
  slate  = (Col 255 43 51 64)
  forest = (Col 255 15 42 34)
}
$useScene = -not $solid.ContainsKey($Bg)
$light = ($Bg -eq 'white')
$pal = if ($Night -eq 1 -and ($Kind -eq 'clear' -or $Kind -eq 'partly')) { $nightSky } else { $sky[$Kind] }
if (-not $useScene) { $pal = @($solid[$Bg], $solid[$Bg]) }
if ($Bg -eq 'daynight') { $pal = @((Hx $SkyTop), (Hx $SkyBottom)) }

function Cloud-Pal([string]$k, [bool]$night, [bool]$light, [bool]$flash) {
  if ($k -eq 'thunder') { if ($flash) { return @('#a29fc8', '#6f6c9c') } else { return @('#6f6c8e', '#3d3b5a') } }
  if ($k -eq 'rain' -or $k -eq 'drizzle') { return @('#a3afc2', '#6c7b93') }
  if ($k -eq 'cloudy') { if ($light) { return @('#cfd7e3', '#9aa8bd') } else { return @('#eef2f7', '#b6c2d4') } }
  if ($night -and ($k -eq 'clear' -or $k -eq 'partly')) { return @('#b3bdd6', '#7c88a8') }
  if ($light) { return @('#e4e9f1', '#aab7cc') } else { return @('#ffffff', '#cbd6e5') }
}

# Cloud: flat body + two rounded ends + two puffs, one vertical gradient.
function Draw-Cloud($g, [double]$cx, [double]$cy, [double]$s, $cp, [double]$alpha = 1) {
  $p = New-Object "$D2D.GraphicsPath"
  $p.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  $p.AddRectangle((New-Object System.Drawing.RectangleF ([single]($cx - 24*$s)), ([single]($cy - 4*$s)), ([single](48*$s)), ([single](24*$s))))
  foreach ($e in @(@(-24, 8, 12), @(24, 8, 12), @(-14, -6, 15), @(9, -13, 20))) {
    $p.AddEllipse([single]($cx + ($e[0] - $e[2])*$s), [single]($cy + ($e[1] - $e[2])*$s), [single](2*$e[2]*$s), [single](2*$e[2]*$s))
  }
  $br = New-Object "$D2D.LinearGradientBrush" (Pt 0 ($cy - 33*$s)), (Pt 0 ($cy + 20*$s)), (Hx $cp[0] (A $alpha)), (Hx $cp[1] (A $alpha))
  $g.FillPath($br, $p)
  $br.Dispose(); $p.Dispose()
}

function Draw-Glow($g, [double]$cx, [double]$cy, [double]$r, [string]$hex, [double]$a) {
  $p = New-Object "$D2D.GraphicsPath"; $p.AddEllipse([single]($cx - $r), [single]($cy - $r), [single](2*$r), [single](2*$r))
  $pb = New-Object "$D2D.PathGradientBrush" $p
  $pb.CenterColor = Hx $hex (A $a); $pb.SurroundColors = @((Hx $hex 0))
  $g.FillPath($pb, $p); $pb.Dispose(); $p.Dispose()
}

function Draw-Sun($g, [double]$cx, [double]$cy, [double]$r, [double]$t) {
  Draw-Glow $g $cx $cy ($r * 2.3) '#ffc933' 0.5
  $pen = New-Object System.Drawing.Pen (Hx '#ffc933'), 4.5
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $len = 8 + 3 * [Math]::Sin($TAU * $t)
  for ($i = 0; $i -lt 8; $i++) {
    $a = ($i * 45 + $t * 45) * [Math]::PI / 180   # one ray-spacing per loop = seamless
    $g.DrawLine($pen, [single]($cx + [Math]::Cos($a)*($r+6)), [single]($cy + [Math]::Sin($a)*($r+6)), [single]($cx + [Math]::Cos($a)*($r+6+$len)), [single]($cy + [Math]::Sin($a)*($r+6+$len)))
  }
  $pen.Dispose()
  $p = New-Object "$D2D.GraphicsPath"; $p.AddEllipse([single]($cx - $r), [single]($cy - $r), [single](2*$r), [single](2*$r))
  $pb = New-Object "$D2D.PathGradientBrush" $p
  $pb.CenterPoint = Pt ($cx - $r*0.3) ($cy - $r*0.3)
  $cb = New-Object "$D2D.ColorBlend" 3
  $cb.Colors = @((Hx '#ffa61f'), (Hx '#ffcf33'), (Hx '#fff3a6')); $cb.Positions = @([single]0, [single]0.55, [single]1)
  $pb.InterpolationColors = $cb
  $g.FillPath($pb, $p); $pb.Dispose(); $p.Dispose()
}

# Crescent: disc minus an offset disc.
function Draw-Moon($g, [double]$cx, [double]$cy, [double]$r) {
  Draw-Glow $g $cx $cy ($r * 2.2) '#dfe6ff' 0.35
  $outer = New-Object "$D2D.GraphicsPath"; $outer.AddEllipse([single]($cx - $r), [single]($cy - $r), [single](2*$r), [single](2*$r))
  $inner = New-Object "$D2D.GraphicsPath"; $ir = $r * 0.86
  $inner.AddEllipse([single]($cx + $r*0.5 - $ir), [single]($cy - $r*0.2 - $ir), [single](2*$ir), [single](2*$ir))
  $reg = New-Object System.Drawing.Region $outer; $reg.Exclude($inner)
  $br = New-Object "$D2D.LinearGradientBrush" (Pt ($cx - $r) ($cy - $r)), (Pt ($cx + $r) ($cy + $r)), (Hx '#fffbe6'), (Hx '#d9d4b4')
  $g.FillRegion($br, $reg)
  $br.Dispose(); $reg.Dispose(); $outer.Dispose(); $inner.Dispose()
}

function Draw-Stars($g, [double]$t, [bool]$light) {
  for ($i = 0; $i -lt 9; $i++) {
    $x = 8 + (Rnd $i 1) * 128; $y = 6 + (Rnd $i 2) * 56
    $tw = 0.5 + 0.5 * [Math]::Sin($TAU * ($t + (Rnd $i 3))); $s = 1.4 + 2.2 * $tw
    $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
    for ($j = 0; $j -lt 8; $j++) { $rr = if ($j % 2) { $s * 0.3 } else { $s }; $a = $j * [Math]::PI / 4; $pts.Add((Pt ($x + [Math]::Cos($a)*$rr) ($y + [Math]::Sin($a)*$rr))) }
    $b = Brush (Hx $(if ($light) { '#8a96aa' } else { '#ffffff' }) (A (0.35 + 0.65 * $tw)))
    $g.FillPolygon($b, $pts.ToArray()); $b.Dispose()
  }
}

# Rain / drizzle / snow fall from behind the cloud base and fade in and out.
function Draw-Precip($g, [string]$kind, [double]$t, [double]$cx, [double]$baseY, [bool]$light) {
  $snowy = ($kind -eq 'snow')
  $n = if ($kind -eq 'drizzle') { 7 } elseif ($snowy) { 12 } else { 10 }
  for ($i = 0; $i -lt $n; $i++) {
    $x = $cx - 27 + ($i + 0.5) * (54 / $n) + ((Rnd $i 1) - 0.5) * 4
    $sp = if ($snowy) { 1 } else { 2 + ($i % 2) }
    $f = ((Rnd $i 2) + $t * $sp) % 1
    $y = $baseY + $f * $(if ($snowy) { 52 } else { 50 })
    $a = [Math]::Min(1, $f * 6) * [Math]::Min(1, (1 - $f) * 2.5)
    if ($snowy) {
      $x += 4 * [Math]::Sin($TAU * ($t + (Rnd $i 3))); $r = 1.8 + (Rnd $i 4) * 1.4
      $b = Brush (Hx $(if ($light) { '#7f9bd0' } else { '#ffffff' }) (A $a))
      $g.FillEllipse($b, [single]($x - $r), [single]($y - $r), [single](2*$r), [single](2*$r)); $b.Dispose()
    } else {
      $w = if ($kind -eq 'drizzle') { 2 } else { 2.6 }; $len = if ($kind -eq 'drizzle') { 7 } else { 11 }
      $pen = New-Object System.Drawing.Pen (Hx $(if ($light) { '#3b8be0' } else { '#8fd0ff' }) (A $a)), $w
      $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round; $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
      $g.DrawLine($pen, [single]$x, [single]$y, [single]($x - 2.5), [single]($y + $len)); $pen.Dispose()
    }
  }
}

function Draw-Bolt($g, [int]$frame) {
  if ($frame -ne 3 -and $frame -ne 4 -and $frame -ne 8) { return }
  $pts = [System.Drawing.PointF[]]@((Pt 76 60), (Pt 60 88), (Pt 71 88), (Pt 64 114), (Pt 88 80), (Pt 76 80), (Pt 86 60))
  $pen = New-Object System.Drawing.Pen (Hx '#ffe45c' 90), 7
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPolygon($pen, $pts); $pen.Dispose()
  $b = Brush (Hx '#ffe45c'); $g.FillPolygon($b, $pts); $b.Dispose()
}

# Fog: a pale cloud over three drifting rounded bars.
function Draw-FogBars($g, [double]$t, [double]$cx, [double]$y0, [bool]$light) {
  $widths = @(58, 42, 52)
  for ($i = 0; $i -lt 3; $i++) {
    $w = $widths[$i]; $dir = if ($i % 2) { -1 } else { 1 }
    $x = $cx + 7 * [Math]::Sin($TAU * ($t + $i / 3)) * $dir; $y = $y0 + $i * 13; $h = 6.5
    $p = New-Object "$D2D.GraphicsPath"; $p.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
    $p.AddRectangle([System.Drawing.RectangleF]::new([single]($x - $w/2 + $h/2), [single]$y, [single]($w - $h), [single]$h))
    $p.AddEllipse([single]($x - $w/2), [single]$y, [single]$h, [single]$h)
    $p.AddEllipse([single]($x + $w/2 - $h), [single]$y, [single]$h, [single]$h)
    $b = Brush (Hx $(if ($light) { '#aab6c8' } else { '#e3e9f1' }) (A 0.9))
    $g.FillPath($b, $p); $b.Dispose(); $p.Dispose()
  }
}

# Draws the weather scene only (no background, no text) in 144x144 space.
function Draw-Scene($g, [string]$k, [bool]$night, [int]$frame, [bool]$light) {
  $t = $frame / $Frames; $d = 3 * [Math]::Sin($TAU * $t)
  $cp = Cloud-Pal $k $night $light ($k -eq 'thunder' -and ($frame -eq 3 -or $frame -eq 4))
  switch ($k) {
    'clear' { if ($night) { Draw-Stars $g $t $light; Draw-Moon $g 72 58 24 } else { Draw-Sun $g 72 58 22 $t } }
    'partly' {
      if ($night) { Draw-Stars $g $t $light; Draw-Moon $g 54 48 17 } else { Draw-Sun $g 54 48 16 $t }
      Draw-Cloud $g (84 + $d*2) 72 0.95 $cp
    }
    'cloudy' {
      Draw-Cloud $g (48 - $d) 50 0.7 (Cloud-Pal 'cloudy' $false $true $false) 0.8
      Draw-Cloud $g (88 + $d) 68 1.05 $cp
    }
    'fog' { Draw-Cloud $g (72 + $d) 40 1 $cp; Draw-FogBars $g $t 72 70 $light }
    default {
      Draw-Precip $g $(if ($k -eq 'thunder') { 'rain' } else { $k }) $t 72 60 $light
      Draw-Cloud $g (72 + $d) 44 1.05 $cp
      if ($k -eq 'thunder') { Draw-Bolt $g $frame }
    }
  }
}

$fmtL = New-Object System.Drawing.StringFormat
$fmtL.Alignment = [System.Drawing.StringAlignment]::Near
$fmtL.LineAlignment = [System.Drawing.StringAlignment]::Center
$fmtL.FormatFlags = [System.Drawing.StringFormatFlags]::NoWrap
$fmtL.Trimming = [System.Drawing.StringTrimming]::None
$fmtM = New-Object System.Drawing.StringFormat $fmtL
$fmtM.Alignment = [System.Drawing.StringAlignment]::Center
$family = New-Object System.Drawing.FontFamily 'Segoe UI'
$textCol = if ($light) { Hx '#101318' } else { Hx '#ffffff' }
$halo = if ($light) { Col 217 255 255 255 } else { Col 178 0 0 0 }

$lift = if ($Dots -gt 1) { 4 } else { 0 }   # room for the page dots under the big text
$rainBlue = if ($light) { Hx '#1f6fd0' } else { Hx '#6fc3ff' }

function Text-Width($g, [string]$text, [double]$px) {
  $f = New-Object System.Drawing.Font($family, [single]$px, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $w = $g.MeasureString($text, $f, 1000, $fmtL).Width - $px * 0.3
  $f.Dispose(); $w
}

# Water droplet (tip at y - s), filled from the bottom up to $lvl (0..1), with an outline halo.
function Draw-Drop($g, [double]$x, [double]$y, [double]$s, $col, [double]$lvl, $outline) {
  $p = New-Object "$D2D.GraphicsPath"
  $p.AddBezier((Pt $x ($y - $s)), (Pt ($x + $s*0.9) ($y + $s*0.1)), (Pt ($x + $s*0.8) ($y + $s*1.1)), (Pt $x ($y + $s*1.1)))
  $p.AddBezier((Pt $x ($y + $s*1.1)), (Pt ($x - $s*0.8) ($y + $s*1.1)), (Pt ($x - $s*0.9) ($y + $s*0.1)), (Pt $x ($y - $s)))
  $halo = New-Object System.Drawing.Pen $outline, 4; $halo.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($halo, $p); $halo.Dispose()
  $g.SetClip($p)
  $b = Brush (Col 56 255 255 255); $g.FillRectangle($b, [single]($x - $s), [single]($y - $s), [single](2*$s), [single](2.2*$s)); $b.Dispose()
  $top = $y + $s*1.1 - $lvl * 2.1 * $s
  $b = Brush $col; $g.FillRectangle($b, [single]($x - $s), [single]$top, [single](2*$s), [single]($y + 2*$s - $top)); $b.Dispose()
  $g.ResetClip()
  $pen = New-Object System.Drawing.Pen $col, 1.5; $g.DrawPath($pen, $p); $pen.Dispose(); $p.Dispose()
}

# Left-aligned bold text, vertically centred on $cy, shrunk until it fits $maxW (all in pixels), with an outline halo.
function Draw-Text($g, [string]$text, [double]$px, [double]$x, [double]$cy, [double]$maxW, $fill, $outline, [bool]$center = $false) {
  while ($true) {
    $f = New-Object System.Drawing.Font($family, [single]$px, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $w = $g.MeasureString($text, $f, 1000, $fmtL).Width - $px * 0.3   # MeasureString pads ~0.3em
    $f.Dispose()
    if ($w -le $maxW -or $px -le 10) { break }
    $px -= 1
  }
  $p = New-Object "$D2D.GraphicsPath"
  $fmt = if ($center) { $fmtM } else { $fmtL }
  $left = if ($center) { $x - 500 } else { $x }
  $p.AddString($text, $family, [int][System.Drawing.FontStyle]::Bold, [single]$px, [System.Drawing.RectangleF]::new([single]$left, [single]($cy - $px), [single]1000, [single](2 * $px)), $fmt)
  $pen = New-Object System.Drawing.Pen $outline, 5
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($pen, $p)
  $b = Brush $fill; $g.FillPath($b, $p)
  $b.Dispose(); $pen.Dispose(); $p.Dispose()
}

for ($frame = 0; $frame -lt $Frames; $frame++) {
  $bmp = New-Object System.Drawing.Bitmap $S, $S
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

  $lg = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Rectangle 0, 0, $S, $S), $pal[0], $pal[1], 90
  $g.FillRectangle($lg, 0, 0, $S, $S); $lg.Dispose()

  # Scene on its own transparent layer: enlarged, centred behind the text, drawn at 40% opacity.
  $layer = New-Object System.Drawing.Bitmap $S, $S
  $lgx = [System.Drawing.Graphics]::FromImage($layer)
  $lgx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $lgx.TranslateTransform(-25, -15); $lgx.ScaleTransform(1.35, 1.35)
  Draw-Scene $lgx $Kind ($Night -eq 1 -and ($Kind -eq 'clear' -or $Kind -eq 'partly')) $frame $light
  $lgx.Dispose()
  $cm = New-Object System.Drawing.Imaging.ColorMatrix
  $cm.Matrix33 = 0.4
  $ia = New-Object System.Drawing.Imaging.ImageAttributes
  $ia.SetColorMatrix($cm)
  $g.DrawImage($layer, (New-Object System.Drawing.Rectangle 0, 0, $S, $S), 0, 0, $S, $S, [System.Drawing.GraphicsUnit]::Pixel, $ia)
  $ia.Dispose(); $layer.Dispose()

  # Big temperature (and city) on top, with a dark halo (light halo on white) so they never blend into the scene.
  if ($Rain -gt 0) {
    # City as headline, blue "NN% rain" subtitle with a droplet that fills to the chance, temperature below.
    # City uses the Date & Time plugin's date size (26 pt = ~35 px), shrinking only for long names.
    if ($City) { Draw-Text $g $City 34.7 ($S / 2) 22 ($S * 0.92) $textCol $halo $true }
    $label = "$Rain%"
    $lw = Text-Width $g $label 34
    $x0 = $S / 2 - ($lw + 30) / 2
    Draw-Drop $g ($x0 + 11) 65 11 $rainBlue ($Rain / 100) $halo
    Draw-Text $g $label 34 ($x0 + 30) 68 ($S - 40) $rainBlue $halo
    Draw-Text $g $Temp 56 8 (113 - $lift) ($S - 14) $textCol $halo
  } else {
    Draw-Text $g $Temp 66 8 (104 - $lift) ($S - 14) $textCol $halo
    if ($City) { Draw-Text $g $City 30 ($S / 2) 22 ($S - 12) $textCol $halo $true }
  }

  # Page dots along the bottom edge: the current slide solid, the others faint.
  if ($Dots -gt 1) {
    $step = 9; $x0 = $S / 2 - ($Dots - 1) * $step / 2
    for ($i = 0; $i -lt $Dots; $i++) {
      $a = if ($i -eq $Dot) { 255 } else { 90 }
      $dc = if ($light) { Col $a 16 19 24 } else { Col $a 255 255 255 }
      $hb = Brush $halo; $g.FillEllipse($hb, [single]($x0 + $i * $step - 3.5), [single](139 - 3.5), [single]7, [single]7); $hb.Dispose()
      $b = Brush $dc; $g.FillEllipse($b, [single]($x0 + $i * $step - 2.5), [single](139 - 2.5), [single]5, [single]5); $b.Dispose()
    }
  }

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  [Console]::Out.WriteLine([Convert]::ToBase64String($ms.ToArray()))
  $ms.Dispose(); $g.Dispose(); $bmp.Dispose()
}
