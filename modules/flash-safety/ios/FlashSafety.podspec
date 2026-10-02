Pod::Spec.new do |s|
  s.name           = 'FlashSafety'
  s.version        = '1.0.0'
  s.summary        = 'Reads the iOS Dim Flashing Lights setting'
  s.author         = 'Theme Park Shark'
  s.homepage       = 'https://themeparkshark.com'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'MediaAccessibility'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'
end
