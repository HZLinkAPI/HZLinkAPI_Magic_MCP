package main

import (
	"bytes"
	"image"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func fixture(t *testing.T) installConfig {
	t.Helper()
	dir := t.TempDir()
	return installConfig{File: filepath.Join(dir, "config.toml"), BackupDirectory: filepath.Join(dir, "备份"),
		Command: `C:\Users\测试\Magic folder\node.exe`, Server: `C:\Users\测试\Magic folder\server.mjs`,
		Data: `C:\Users\测试\图库`, Magpie: `D:\Magpie App\magpie.exe`}
}
func TestConfig(t *testing.T) {
	cfg := fixture(t)
	samples := [][]byte{
		nil,
		[]byte("# keep this comment\r\n[features] # flags\r\nenable_mcp_apps = false # old\r\n\r\n[mcp_servers.other]\r\ncommand = \"other\"\r\n\r\n[mcp_servers.hzlinkapi_creator]\r\ncommand = \"old\"\r\n\r\n[mcp_servers.hzlinkapi_creator.env]\r\nOLD = \"remove\"\r\n"),
		[]byte("model = \"test\"\nfeatures = { other = true, enable_mcp_apps = false }\n[mcp_servers.other]\ncommand = \"other\"\n"),
		[]byte("features = { other = true }\n[mcp_servers.other]\ncommand = \"other\"\n"),
		[]byte("features.other = true\n[other]\na = \"\"\"\n[features]\nenable_mcp_apps = false\n\"\"\"\n"),
		append(bytes.Clone(bom), []byte("[features]")...),
	}
	for n, input := range samples {
		output, err := updateConfig(input, cfg)
		if err != nil {
			t.Fatalf("case %d: %v", n, err)
		}
		if !bytes.Contains(output, []byte("enable_mcp_apps = true")) {
			t.Fatalf("case %d: enablement missing: %s", n, output)
		}
		if bytes.Contains(input, []byte("# keep this comment")) && !bytes.Contains(output, []byte("# keep this comment\r\n")) {
			t.Fatal("comments or line endings changed")
		}
		again, err := updateConfig(output, cfg)
		if err != nil || !bytes.Equal(again, output) {
			t.Fatalf("case %d: repeat install changed the config: %v", n, err)
		}
	}
}
func TestWriteConfigBackup(t *testing.T) {
	cfg := fixture(t)
	original := []byte("# untouched\n[mcp_servers.other]\ncommand = \"existing\"\n")
	if err := os.WriteFile(cfg.File, original, 0600); err != nil {
		t.Fatal(err)
	}
	result, err := writeConfig(cfg)
	if err != nil || !result.Changed {
		t.Fatalf("%+v %v", result, err)
	}
	backup, err := os.ReadFile(result.Backup)
	if err != nil || !bytes.Equal(backup, original) {
		t.Fatal("backup did not preserve source")
	}
	second, err := writeConfig(cfg)
	if err != nil || second.Changed || second.Backup != "" {
		t.Fatalf("%+v %v", second, err)
	}
	broken := []byte("features = {")
	if err = os.WriteFile(cfg.File, broken, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err = writeConfig(cfg); err == nil {
		t.Fatal("invalid config accepted")
	}
	current, err := os.ReadFile(cfg.File)
	if err != nil || !bytes.Equal(current, broken) {
		t.Fatal("invalid configuration was modified")
	}
}
func TestPNGAndThumbnail(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "参考 图.jpg")
	f, err := os.Create(source)
	if err != nil {
		t.Fatal(err)
	}
	if err = jpeg.Encode(f, image.NewRGBA(image.Rect(0, 0, 500, 250)), nil); err != nil {
		t.Fatal(err)
	}
	if err = f.Close(); err != nil {
		t.Fatal(err)
	}
	for _, max := range []int{0, 224} {
		dst := filepath.Join(dir, "结果 图.png")
		if err = writePNG(source, dst, max); err != nil {
			t.Fatal(err)
		}
		f, err = os.Open(dst)
		if err != nil {
			t.Fatal(err)
		}
		cfg, err := png.DecodeConfig(f)
		f.Close()
		w := max
		if max == 0 {
			w = 500
		}
		if err != nil || cfg.Width != w || cfg.Height != w/2 {
			t.Fatalf("unexpected PNG: %+v %v", cfg, err)
		}
	}
}
