package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"os"
	"strconv"

	_ "golang.org/x/image/bmp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
)

func writePNG(source, target string, max int) error {
	f, err := os.Open(source)
	if err != nil {
		return err
	}
	defer f.Close()
	cfg, _, err := image.DecodeConfig(f)
	if err != nil {
		return err
	}
	if cfg.Width < 1 || cfg.Height < 1 || cfg.Width > 16384 || cfg.Height > 16384 || int64(cfg.Width)*int64(cfg.Height) > 100_000_000 {
		return errors.New("图片尺寸超出本机处理上限")
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	decoded, _, err := image.Decode(f)
	if err != nil {
		return err
	}
	w, h := cfg.Width, cfg.Height
	if max > 0 && (w > max || h > max) {
		if w >= h {
			h = max * h / w
			if h < 1 {
				h = 1
			}
			w = max
		} else {
			w = max * w / h
			if w < 1 {
				w = 1
			}
			h = max
		}
		dst := image.NewNRGBA(image.Rect(0, 0, w, h))
		draw.CatmullRom.Scale(dst, dst.Bounds(), decoded, decoded.Bounds(), draw.Src, nil)
		decoded = dst
	}
	out, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	err = png.Encode(out, decoded)
	closeErr := out.Close()
	if err != nil {
		return err
	}
	return closeErr
}
func run(args []string) error {
	if len(args) == 0 {
		return errors.New("缺少操作")
	}
	output := json.NewEncoder(os.Stdout)
	switch args[0] {
	case "image":
		if len(args) != 4 {
			return errors.New("图片转换参数无效")
		}
		max, err := strconv.Atoi(args[3])
		if err != nil || max < 0 || max > 2048 {
			return errors.New("缩略图尺寸无效")
		}
		return writePNG(args[1], args[2], max)
	case "config":
		var config installConfig
		if err := json.NewDecoder(io.LimitReader(os.Stdin, 1<<20)).Decode(&config); err != nil {
			return err
		}
		result, err := writeConfig(config)
		if err != nil {
			return err
		}
		return output.Encode(result)
	case "save-as":
		if len(args) != 2 {
			return errors.New("缺少默认文件名")
		}
		path, err := chooseFile(args[1], true)
		if err != nil {
			return err
		}
		return output.Encode(path)
	case "pick-magpie":
		path, err := chooseFile("magpie.exe", false)
		if err != nil {
			return err
		}
		return output.Encode(path)
	case "find-magpie":
		return output.Encode(findMagpie())
	}
	return errors.New("未知操作")
}
func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
