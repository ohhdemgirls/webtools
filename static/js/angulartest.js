var app = angular.module('test', ['ngResource', 'ngRoute', 'angularMoment', 'mm.foundation'])
    .config(function($interpolateProvider, $httpProvider) {
      $interpolateProvider.startSymbol("{!").endSymbol("!}");

    $httpProvider.defaults.xsrfHeaderName = 'X-CSRFToken';
    $httpProvider.defaults.xsrfCookieName = 'csrftoken';
  });


app.service('visibilityApiService', function visibilityApiService($rootScope) {
    function visibilitychanged() {
        $rootScope.$broadcast('visibilityChanged', document.hidden || document.webkitHidden || document.mozHidden || document.msHidden)
    }

    document.addEventListener("visibilitychange",visibilitychanged);
    document.addEventListener("webkitvisibilitychange", visibilitychanged);
    document.addEventListener("msvisibilitychange", visibilitychanged);
});


app.factory('status_info', function () {
    var named = {
        NE: "new",
        GR: "grabbed",
        QU: "queued",
        DL: "downloading",
        GE: "grab error",
        IG: "ignored",
    }

    return {
        key_to_name: named,

        human_name: function (status){
            return named[status] || status;
        },
        css_class: function(status){
            return {
                NE: "new",
                GR: "grabbed",
                QU: "queued",
                DL: "downloading",
                GE: "error",
                IG: "ignored",
            }[status] || status;
        }
    }
});


app.filter('status_text', ['status_info', function(status_info) {
   return function(text) {
       return status_info.human_name(text);
   }
}]);



app.config(['$routeProvider',
            function($routeProvider){
                $routeProvider.
                    when('/channels', {
                        templateUrl: '/static/partials/channel-list.html',
                        controller: 'ChannelList'
                    }).
                    when('/channels/:id', {
                        'templateUrl': '/static/partials/channel-view.html',
                        controller: 'ChannelView'
                    }).
                    when('/add/', {
                        'templateUrl': '/static/partials/channel-add.html',
                        controller: 'ChannelAdd'
                    }).
                    otherwise({
                        redirectTo: '/channels'
                    });
            }]);


app.controller(
    "ChannelAdd",
    function ($scope, $routeParams, $http, $location, $interval, visibilityApiService, status_info){
        $scope.status_info = status_info;

        $scope.available_services = [{'name': "YouTube"}, {'name': "Vimeo"}];
        $scope.service = $scope.available_services[0];
        $scope.channel = "";

        $scope.submit_add = function(){
            console.log("Hi", $scope.channel, $scope.service.name);
        }
    });

app.controller(
    "ChannelList",
    function ChannelList($scope, $resource, $http, status_info){
        $scope.status_info = status_info;

        $scope.search_text = "";
        $scope.loading = false;

        $scope.init = function(){
            console.log("Channel list init");
            $scope.refresh();
        }

        $scope.refresh = function(){
            console.log("Refreshing");
            $scope.loading = true;

            $http({method: 'GET', url: '/youtube/api/1/channels'}).
                success(function(data, status, headers, config){
                    console.log("Yay");
                    console.log(data);

                    $scope.data = data;

                    $scope.loading=false;
                }).
                error(function(data, status, headers, config){
                    console.log("boo");
                    $scope.loading="";
                });
        }

    });


app.controller(
    "ChannelView",
    function ($scope, $routeParams, $http, $location, $interval, visibilityApiService, status_info){
        $scope.status_info = status_info;

        function is_loading(active){
            if(active){
                $(".content").mask("Loading");
            } else {
                $(".content").unmask();
            }
        }

        is_loading(true);

        // Store channel ID, and current page
        $scope.id = $routeParams.id;
        $scope.page = Math.max(1, parseInt($routeParams.page || 0));
        console.log("Viewing channel " + $scope.id + " page " + $scope.page );

        $scope.search_text = $routeParams.search || "";

        function filterstatus_parse(blah){
            var statuses = {}
            angular.forEach(status_info.key_to_name, function(_name, key){
                statuses[key] = false;
            });
            angular.forEach(blah.split(","), function(x){
                if(x.length > 0 && x in statuses){
                    statuses[x] = true;
                }
            });
            return statuses;
        }
        function filterstatus_format(blah){
            var thing = []
            angular.forEach(blah, function(v, k){
                if(v){
                    thing.push(k)
                }
            })
            return thing.join(",")
        }
        $scope.search_status = filterstatus_parse($routeParams.status || "");


        // Query data
        $http.get('/youtube/api/1/channels/' + $scope.id + "?page=" + $scope.page + "&search=" + encodeURIComponent($scope.search_text) + "&status=" + filterstatus_format($scope.search_status)).success(function(data) {
            is_loading(false);

            $scope.data = data;
            console.log(data);
        });

        // Actions
        $scope.search_update = function(){
            $location.search('search', $scope.search_text);
            $location.search('status', filterstatus_format($scope.search_status));
        }

        $scope.refresh_channel = function(chanid){
            var torefresh = chanid || $scope.id;

            console.log("Refreshing channel")
            var req = $http.get('/youtube/api/1/refresh?channel=' + $scope.id)
            req.success(function(data){
                console.log("Channel refresh started")
            });
            req.error(function(data){
                console.log("Error refreshing channel", data);
            })
        }
        function _do_video_action(video, name, force){
            if(typeof(force) === 'undefined'){
                force=false;
            }

            console.log("Doing action", name, "for id", video.id, "forcefully", force);

            video.action_running = true; // Show spinner

            // Call grab method of API
            $http.get("/youtube/api/1/video/" + video.id + "/" + name + "?force=" + force).success(function(data){
                console.log("Initatised grab", data);
                video.action_running = false;
                video.status = data.status;
            }).error(function(data){
                console.log("Error initating grab", data);
                if(data.error){
                    // TODO: Less annoying popup, allow force download
                    if(confirm(data.error + "\n" + "Forcefully try again?")){
                        _do_video_action(video, name, true); // force
                    }
                }
                video.action_running = false;
            });
        }

        $scope.download = function(video){
            return _do_video_action(video, "grab");
        }

        $scope.mark_viewed = function(video){
            return _do_video_action(video, "mark_viewed");
        }
        $scope.mark_ignored = function(video){
            return _do_video_action(video, "mark_ignored");
        }

        // Pagination
        $scope.next_page = function(){
            console.log("next page");
            $location.search('page', $scope.page + 1);
        }
        $scope.prev_page = function(){
            console.log("prev page");
            $location.search('page', $scope.page - 1);
        }

        // Refresh status regularly
        $scope.update_statuses = function(){
            var ids = [];
            $scope.data.videos.forEach(function(v){
                ids.push(v.id);
            });
            var status_query = $http.get("/youtube/api/1/video_status?ids=" + ids.join());
            status_query.error(function(data){
                console.log("Error querying status");
            });

            status_query.success(function(data){
                $scope.data.videos.forEach(function(v, index){
                    $scope.data.videos[index].status = data[v.id];
                });
            });
        }

        var refresh_timer = undefined;
        $scope.periodic_start = function(){
            if(angular.isDefined(refresh_timer)){
                //console.log("Timer already exists");
            } else {
                console.log("Starting timer");
                refresh_timer = $interval(function(){
                    //console.log("Refreshing status");
                    $scope.update_statuses();
                    $scope.periodic_start();
                }, 5000);
            }
        }
        $scope.periodic_stop = function(){
            $interval.cancel(refresh_timer);
            refresh_timer = undefined;
        }
        $scope.periodic_start(); // Start initial
        $scope.$on("$locationChangeStart", function(){
            // Cancel timer when navigating away
            $scope.periodic_stop();
        })

        $scope.$on('visibilityChanged', function(event, isHidden) {
            if(isHidden) {
                console.log("Not refreshing background page");
                $scope.periodic_stop();
            }else{
                console.log("Page in foreground, resuming refresh");
                $scope.update_statuses(); // TODO: Rate-limit this, to prevent quick switching causing repeated refreshes?
                $scope.periodic_start();
            }
        });


        // Helpers
        $scope.status = function(video){
            // Status to pretty-UI-name
        }
        $scope.class_for_status = function(video){
            // Status to CSS class for table row
            return {
                NE: "new",
                GR: "grabbed",
                QU: "queued",
                DL: "downloading",
                GE: "grab_error",
                IG: "ignored",
            }[video.status] || video.status;
        }
    });



app.controller('ChannelViewListCtrl', function($scope, $timeout, $resource, ngTableParams, $location) {
    // The list of videos, shown on the ChannelView page (access $scope.id from parent)

    console.log("ChannelViewListCtrl! Has id?!", $scope.id);
    var Api = $resource('/youtube/api/1/channels/' + $scope.id);

    $scope.tableParams = new ngTableParams(
        angular.extend(
            {
                page: 1,
                count: 2,
                sorting: {
                    name: 'asc'     // initial sorting
                }
            },
            $location.search()),
        {
            total: 0,           // length of data
            getData: function($defer, params) {
                $location.search(params.url());
                // ajax request to api
                Api.get(params.url(), function(data) {
                    $timeout(function() {
                        // update table params
                        params.total(data.total);
                        // set new data
                        $defer.resolve(data.videos);
                    }, 500);
                });
            }
        });
});


app.controller('ChannelList2', function($scope, $timeout, $resource, ngTableParams, $location) {
    var Api = $resource('/youtube/api/1/channels');

    $scope.tableParams = new ngTableParams(
        angular.extend(
            {
                page: 1,
                count: 20,
                sorting: {
                    name: 'asc'     // initial sorting
                }
            },
            $location.search()),
        {
            total: 0,           // length of data
            getData: function($defer, params) {
                $location.search(params.url());
                // ajax request to api
                Api.get(params.url(), function(data) {
                    $timeout(function() {
                        // update table params
                        params.total(data.total);
                        // set new data
                        $defer.resolve(data.channels);
                    }, 100);
                });
            }
        });
});



var VideoInfoPopupCtrl = function ($scope, $modal, $log) {

    $scope.items = ['item1', 'item2', 'item3'];

    $scope.open = function(video){
        console.log("Modal for video", video);
        $scope.video = video;

        var modalInstance = $modal.open({
            templateUrl: 'videoInfoPopup.html',
            controller: ModalInstanceCtrl,
            resolve: {
                video: function (){
                    return $scope.video;
                }
            }
        });

        modalInstance.result.then(function (selectedItem) {
            $scope.selected = selectedItem;
        }, function () {
            $log.info('Modal dismissed at: ' + new Date());
        });
    };
};

// Please note that $modalInstance represents a modal window (instance) dependency.
// It is not the same as the $modal service used above.

var ModalInstanceCtrl = function ($scope, $modalInstance, video) {
  $scope.video = video;

  $scope.ok = function () {
    $modalInstance.close($scope.selected.item);
  };

  $scope.cancel = function () {
    $modalInstance.dismiss('cancel');
  };
};


app.filter("nl2br", function($filter, $sce) {
 return function(data) {
   if (!data) return data;
   return $sce.trustAsHtml(data.replace(/\n\r?/g, '<br>'));
 };
});


//
app.controller(
    "DownloadList",
    function ($scope, $resource, $http){

        $scope.init = function(){
            console.log("Download list init");
            $scope.refresh();
        }


        // TODO: Auto-refresh this
        $scope.refresh = function(){
            console.log("Refreshing");
            $scope.loading = true;

            $http({method: 'GET', url: '/youtube/api/1/downloads'}).
                success(function(data, status, headers, config){
                    console.log("Yay");
                    console.log(data);

                    $scope.downloads = data;

                    $scope.loading=false;
                }).
                error(function(data, status, headers, config){
                    console.log("boo");
                });
        }

    });
