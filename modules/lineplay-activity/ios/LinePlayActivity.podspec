Pod::Spec.new do |s|
  s.name           = 'LinePlayActivity'
  s.version        = '1.0.0'
  s.summary        = 'LinePlay Ride Part Live Activity bridge'
  s.author         = 'Theme Park Shark'
  s.homepage       = 'https://themeparkshark.com'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.swift_version  = '5.9'
  s.source_files   = '**/*.swift'
end
