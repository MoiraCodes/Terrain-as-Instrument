# Build script for orbbec binaries.
# Usage:
#   make            build the depth binary
#   (vision target needs orbbec_syphon_vision.m, which is vendor source and not included)
#   make depth      build depth-only binary (our source)
#   make vision     build Apple Vision binary (source from vendor/)
#   make run        build depth + launch
#   make clean      wipe bin/

SDK         := ../../vendor/OrbbecSDK
VENDOR      := ../../vendor

DEPTH_SRC   := orbbec_syphon_depth.mm
DEPTH_BIN   := bin/orbbec_syphon_depth

VISION_SRC  := orbbec_syphon_vision.m
VISION_BIN  := bin/orbbec_syphon_vision

CXX         := clang++
CC          := clang

# rpath relative to bin/: 3 levels up gets us to the repo root.
RPATH_SDK    := -Wl,-rpath,@executable_path/../../../vendor/OrbbecSDK/lib
RPATH_VENDOR := -Wl,-rpath,@executable_path/../../../vendor

# --- depth binary (Objective-C++, ours) ---
DEPTH_CXXFLAGS := -std=c++17 -ObjC++ -Wall -O2 -I$(SDK)/include
DEPTH_LDFLAGS  := -L$(SDK)/lib -lOrbbecSDK \
                  -framework Foundation \
                  $(RPATH_SDK)

# --- vision binary (Objective-C, source from vendor/) ---
# Uses Apple Vision + Syphon (OpenGL) + OrbbecSDK.
VISION_CFLAGS  := -ObjC -fobjc-arc -Wall -O2 -I$(SDK)/include -DGL_SILENCE_DEPRECATION
VISION_LDFLAGS := -L$(SDK)/lib -lOrbbecSDK \
                  -F$(VENDOR) \
                  -framework Foundation \
                  -framework AppKit \
                  -framework OpenGL \
                  -framework Vision \
                  -framework CoreVideo \
                  -framework Syphon \
                  $(RPATH_SDK) $(RPATH_VENDOR)

.PHONY: all depth vision run clean

all: depth

depth: $(DEPTH_BIN)
vision: $(VISION_BIN)

$(DEPTH_BIN): $(DEPTH_SRC) | bin
	$(CXX) $(DEPTH_CXXFLAGS) $(DEPTH_SRC) $(DEPTH_LDFLAGS) -o $(DEPTH_BIN)

$(VISION_BIN): $(VISION_SRC) | bin
	$(CC) $(VISION_CFLAGS) $(VISION_SRC) $(VISION_LDFLAGS) -o $(VISION_BIN)

bin:
	mkdir -p bin

run: $(DEPTH_BIN)
	./$(DEPTH_BIN)

clean:
	rm -rf bin
